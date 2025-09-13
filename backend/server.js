const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = '/app/data';

// Middleware
app.use(cors());
app.use(express.json());

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

// Cornell Dining API endpoint
const CORNELL_API_BASE = 'https://now.dining.cornell.edu/api/1.0/dining/eateries.json';

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// Get dining data from Cornell API
app.get('/api/dining/:date?', async (req, res) => {
    try {
        const date = req.params.date || getTodayDate();
        console.log(`[${new Date().toISOString()}] Fetching dining data for date: ${date}`);
        
        const response = await axios.get(`${CORNELL_API_BASE}?date=${date}`);
        console.log(`[${new Date().toISOString()}] Cornell API response status: ${response.status}`);
        console.log(`[${new Date().toISOString()}] Cornell API response data keys:`, Object.keys(response.data));
        
        if (response.data && response.data.data && response.data.data.eateries) {
            console.log(`[${new Date().toISOString()}] Found ${response.data.data.eateries.length} eateries`);
            const sampleIds = response.data.data.eateries.slice(0, 5).map(e => `${e.id}(${typeof e.id})`);
            console.log(`[${new Date().toISOString()}] Sample eatery ID types:`, sampleIds);
        } else {
            console.log(`[${new Date().toISOString()}] Unexpected data structure:`, JSON.stringify(response.data, null, 2).substring(0, 500));
        }
        
        res.json(response.data);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error fetching dining data:`, error.message);
        console.error(`[${new Date().toISOString()}] Error stack:`, error.stack);
        res.status(500).json({ error: 'Failed to fetch dining data' });
    }
});

// User authentication and profile management
app.post('/api/auth/signin', async (req, res) => {
    try {
        const { name, deviceId } = req.body;
        console.log(`[${new Date().toISOString()}] Sign-in attempt - Name: ${name}, DeviceId: ${deviceId}`);
        
        if (!name || !deviceId) {
            console.log(`[${new Date().toISOString()}] Sign-in failed - Missing name or deviceId`);
            return res.status(400).json({ error: 'Name and deviceId are required' });
        }

        const userFile = path.join(DATA_DIR, 'users.json');
        let users = {};
        
        if (await fs.pathExists(userFile)) {
            users = await fs.readJson(userFile);
            console.log(`[${new Date().toISOString()}] Loaded existing users file with ${Object.keys(users).length} users`);
        } else {
            console.log(`[${new Date().toISOString()}] Creating new users file`);
        }

        const userId = uuidv4();
        users[deviceId] = {
            userId,
            name,
            deviceId,
            signedInAt: new Date().toISOString()
        };

        await fs.writeJson(userFile, users, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] User signed in successfully - UserId: ${userId}`);
        
        res.json({ 
            success: true, 
            user: { userId, name, deviceId }
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error signing in:`, error.message);
        console.error(`[${new Date().toISOString()}] Error stack:`, error.stack);
        res.status(500).json({ error: 'Failed to sign in' });
    }
});

// Check if user is signed in
app.get('/api/auth/check/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        console.log(`[${new Date().toISOString()}] Checking auth for deviceId: ${deviceId}`);
        
        const userFile = path.join(DATA_DIR, 'users.json');
        
        if (!(await fs.pathExists(userFile))) {
            console.log(`[${new Date().toISOString()}] Users file does not exist`);
            return res.json({ signedIn: false });
        }

        const users = await fs.readJson(userFile);
        console.log(`[${new Date().toISOString()}] Loaded users file with ${Object.keys(users).length} users`);
        
        const user = users[deviceId];
        
        if (user) {
            console.log(`[${new Date().toISOString()}] User found - Name: ${user.name}, UserId: ${user.userId}`);
            res.json({ 
                signedIn: true, 
                user: { userId: user.userId, name: user.name, deviceId: user.deviceId }
            });
        } else {
            console.log(`[${new Date().toISOString()}] User not found for deviceId: ${deviceId}`);
            res.json({ signedIn: false });
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error checking auth:`, error.message);
        console.error(`[${new Date().toISOString()}] Error stack:`, error.stack);
        res.status(500).json({ error: 'Failed to check authentication' });
    }
});

// Sign out
app.delete('/api/auth/signout/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const userFile = path.join(DATA_DIR, 'users.json');
        
        if (await fs.pathExists(userFile)) {
            const users = await fs.readJson(userFile);
            delete users[deviceId];
            await fs.writeJson(userFile, users, { spaces: 2 });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error signing out:', error.message);
        res.status(500).json({ error: 'Failed to sign out' });
    }
});

// Helper function to get today's date in YYYY-MM-DD format
function getTodayDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

// Helper function to transfer daily hearts to KNN storage and clear daily storage
async function transferDailyHeartsToKNN() {
    try {
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
        
        if (!(await fs.pathExists(dailyHeartsFile))) {
            return; // No daily hearts to transfer
        }

        let hearts = {};
        let dailyHearts = {};
        
        if (await fs.pathExists(heartsFile)) {
            hearts = await fs.readJson(heartsFile);
        }
        
        dailyHearts = await fs.readJson(dailyHeartsFile);
        
        // Initialize KNN storage structures
        if (!hearts.knnDiningHallHearts) hearts.knnDiningHallHearts = [];
        if (!hearts.knnMenuItemHearts) hearts.knnMenuItemHearts = [];
        
        // Transfer daily hearts to KNN storage
        if (dailyHearts.dailyDiningHallHearts) {
            hearts.knnDiningHallHearts.push(...dailyHearts.dailyDiningHallHearts);
        }
        if (dailyHearts.dailyMenuItemHearts) {
            hearts.knnMenuItemHearts.push(...dailyHearts.dailyMenuItemHearts);
        }
        
        // Save updated KNN storage
        await fs.writeJson(heartsFile, hearts, { spaces: 2 });
        
        // Clear daily hearts file
        await fs.writeJson(dailyHeartsFile, {
            lastTransferDate: getTodayDateString(),
            dailyDiningHallHearts: [],
            dailyMenuItemHearts: []
        }, { spaces: 2 });
        
        console.log(`[${new Date().toISOString()}] [HEARTS-TRANSFER] Transferred daily hearts to KNN storage and cleared daily storage`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS-TRANSFER] Error transferring daily hearts:`, error);
    }
}

// Helper function to check if we need to transfer yesterday's hearts
async function checkAndTransferPreviousDayHearts() {
    try {
        const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
        
        if (!(await fs.pathExists(dailyHeartsFile))) {
            // Create initial daily hearts file
            await fs.writeJson(dailyHeartsFile, {
                lastTransferDate: getTodayDateString(),
                dailyDiningHallHearts: [],
                dailyMenuItemHearts: []
            }, { spaces: 2 });
            return;
        }
        
        const dailyHearts = await fs.readJson(dailyHeartsFile);
        const today = getTodayDateString();
        
        if (dailyHearts.lastTransferDate !== today) {
            // Transfer yesterday's hearts to KNN storage
            await transferDailyHeartsToKNN();
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS-CHECK] Error checking previous day hearts:`, error);
    }
}

// Heart/Like system for dining halls
app.post('/api/hearts/dining-hall', async (req, res) => {
    try {
        const { userId, diningHallId: rawDiningHallId, action } = req.body; // action: 'like' or 'unlike'
        const diningHallId = parseInt(rawDiningHallId, 10); // Ensure numeric ID
        
        console.log(`[${new Date().toISOString()}] [HEARTS-DINING] User ${userId} ${action} dining hall ${diningHallId}`);
        
        // Check and transfer previous day hearts if needed
        await checkAndTransferPreviousDayHearts();
        
        const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
        let dailyHearts = {};
        
        if (await fs.pathExists(dailyHeartsFile)) {
            dailyHearts = await fs.readJson(dailyHeartsFile);
        } else {
            dailyHearts = {
                lastTransferDate: getTodayDateString(),
                dailyDiningHallHearts: [],
                dailyMenuItemHearts: []
            };
        }

        // Initialize daily storage structures
        if (!dailyHearts.dailyDiningHallHearts) dailyHearts.dailyDiningHallHearts = [];

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const timeOfDay = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const dateCreated = getTodayDateString();

        console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Context: Day ${dayOfWeek}, Time ${timeOfDay}, Date ${dateCreated}`);

        // Check if heart exists in daily storage
        const existingHeartIndex = dailyHearts.dailyDiningHallHearts.findIndex(
            heart => heart.userId === userId && heart.diningHallId === diningHallId
        );
        const isLiked = existingHeartIndex !== -1;

        if (action === 'like' && !isLiked) {
            // Add to daily storage
            const heartRecord = {
                userId,
                diningHallId,
                dayOfWeek,
                timeOfDay,
                dateCreated,
                timestamp: now.toISOString()
            };
            dailyHearts.dailyDiningHallHearts.push(heartRecord);
            
            console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Added daily heart record:`, heartRecord);
        } else if (action === 'unlike' && isLiked) {
            // Remove from daily storage
            dailyHearts.dailyDiningHallHearts.splice(existingHeartIndex, 1);
            
            console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Removed daily heart record for user ${userId}, hall ${diningHallId}`);
        }

        await fs.writeJson(dailyHeartsFile, dailyHearts, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Daily hearts file updated. Total daily dining hall hearts: ${dailyHearts.dailyDiningHallHearts.length}`);
        
        res.json({ 
            success: true, 
            isLiked: action === 'like' ? true : false 
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS-DINING] Error updating dining hall heart:`, error.message);
        console.error(`[${new Date().toISOString()}] [HEARTS-DINING] Error stack:`, error.stack);
        res.status(500).json({ error: 'Failed to update heart' });
    }
});

// Heart/Like system for menu items
app.post('/api/hearts/menu-item', async (req, res) => {
    try {
        const { userId, menuItemId, action, diningHallId: rawDiningHallId } = req.body; // action: 'like' or 'unlike', need diningHallId for context
        const diningHallId = parseInt(rawDiningHallId, 10); // Ensure numeric ID
        
        console.log(`[${new Date().toISOString()}] [HEARTS-MENU] User ${userId} ${action} menu item ${menuItemId} at dining hall ${diningHallId}`);
        
        // Check and transfer previous day hearts if needed
        await checkAndTransferPreviousDayHearts();
        
        const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
        let dailyHearts = {};
        
        if (await fs.pathExists(dailyHeartsFile)) {
            dailyHearts = await fs.readJson(dailyHeartsFile);
        } else {
            dailyHearts = {
                lastTransferDate: getTodayDateString(),
                dailyDiningHallHearts: [],
                dailyMenuItemHearts: []
            };
        }

        // Initialize daily storage structures
        if (!dailyHearts.dailyMenuItemHearts) dailyHearts.dailyMenuItemHearts = [];

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const timeOfDay = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        const dateCreated = getTodayDateString();

        console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Context: Day ${dayOfWeek}, Time ${timeOfDay}, Date ${dateCreated}`);

        // Check if heart exists in daily storage
        const existingHeartIndex = dailyHearts.dailyMenuItemHearts.findIndex(
            heart => heart.userId === userId && heart.menuItemId === menuItemId
        );
        const isLiked = existingHeartIndex !== -1;

        if (action === 'like' && !isLiked) {
            // Add to daily storage
            const heartRecord = {
                userId,
                menuItemId,
                diningHallId: diningHallId || 'unknown',
                dayOfWeek,
                timeOfDay,
                dateCreated,
                timestamp: now.toISOString()
            };
            dailyHearts.dailyMenuItemHearts.push(heartRecord);
            
            console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Added daily heart record:`, heartRecord);
        } else if (action === 'unlike' && isLiked) {
            // Remove from daily storage
            dailyHearts.dailyMenuItemHearts.splice(existingHeartIndex, 1);
            
            console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Removed daily heart record for user ${userId}, menu item ${menuItemId}`);
        }

        await fs.writeJson(dailyHeartsFile, dailyHearts, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Daily hearts file updated. Total daily menu item hearts: ${dailyHearts.dailyMenuItemHearts.length}`);
        
        res.json({ 
            success: true, 
            isLiked: action === 'like' ? true : false 
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS-MENU] Error updating menu item heart:`, error.message);
        console.error(`[${new Date().toISOString()}] [HEARTS-MENU] Error stack:`, error.stack);
        res.status(500).json({ error: 'Failed to update heart' });
    }
});

// Get user's hearts (only today's hearts for display)
app.get('/api/hearts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check and transfer previous day hearts if needed
        await checkAndTransferPreviousDayHearts();
        
        const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
        
        if (!(await fs.pathExists(dailyHeartsFile))) {
            return res.json({ diningHalls: [], menuItems: [] });
        }

        const dailyHearts = await fs.readJson(dailyHeartsFile);
        
        // Filter hearts for this user and extract just the IDs for compatibility
        const userDiningHalls = (dailyHearts.dailyDiningHallHearts || [])
            .filter(heart => heart.userId === userId)
            .map(heart => heart.diningHallId);
            
        const userMenuItems = (dailyHearts.dailyMenuItemHearts || [])
            .filter(heart => heart.userId === userId)
            .map(heart => heart.menuItemId);
        
        res.json({
            diningHalls: userDiningHalls,
            menuItems: userMenuItems
        });
    } catch (error) {
        console.error('Error getting hearts:', error.message);
        res.status(500).json({ error: 'Failed to get hearts' });
    }
});

// Get user's detailed heart records (only today's hearts for display)
app.get('/api/hearts/:userId/detailed', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Check and transfer previous day hearts if needed
        await checkAndTransferPreviousDayHearts();
        
        const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
        
        if (!(await fs.pathExists(dailyHeartsFile))) {
            return res.json({ diningHallHearts: [], menuItemHearts: [] });
        }

        const dailyHearts = await fs.readJson(dailyHeartsFile);
        
        const userDiningHearts = (dailyHearts.dailyDiningHallHearts || []).filter(heart => heart.userId === userId);
        const userMenuHearts = (dailyHearts.dailyMenuItemHearts || []).filter(heart => heart.userId === userId);
        
        res.json({
            diningHallHearts: userDiningHearts,
            menuItemHearts: userMenuHearts
        });
    } catch (error) {
        console.error('Error getting detailed hearts:', error.message);
        res.status(500).json({ error: 'Failed to get detailed hearts' });
    }
});

// Get KNN heart data (for recommendations - historical data)
app.get('/api/hearts/:userId/knn', async (req, res) => {
    try {
        const { userId } = req.params;
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        
        if (!(await fs.pathExists(heartsFile))) {
            return res.json({ diningHallHearts: [], menuItemHearts: [] });
        }

        const hearts = await fs.readJson(heartsFile);
        
        const userDiningHearts = (hearts.knnDiningHallHearts || []).filter(heart => heart.userId === userId);
        const userMenuHearts = (hearts.knnMenuItemHearts || []).filter(heart => heart.userId === userId);
        
        res.json({
            diningHallHearts: userDiningHearts,
            menuItemHearts: userMenuHearts
        });
    } catch (error) {
        console.error('Error getting KNN hearts:', error.message);
        res.status(500).json({ error: 'Failed to get KNN hearts' });
    }
});

// Get dining hall recommendations for a user
app.get('/api/recommendations/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { time, day } = req.query; // Expected format: time="14:00", day="1" (0=Sunday, 1=Monday, etc.)
        
        console.log(`[${new Date().toISOString()}] [RECOMMENDATIONS] Starting recommendation generation for userId: ${userId}, time: ${time}, day: ${day}`);
        const startTime = Date.now();
        
        const recommendations = await generateRecommendations(userId, time, day);
        
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] [RECOMMENDATIONS] Generated ${recommendations.length} recommendations for userId: ${userId} in ${duration}ms`);
        recommendations.forEach((rec, index) => {
            console.log(`[${new Date().toISOString()}] [RECOMMENDATIONS] #${index + 1}: Hall ${rec.diningHallId} (type: ${typeof rec.diningHallId}), confidence: ${rec.confidence.toFixed(3)}, reason: "${rec.reason}"`);
        });
        
        res.json({
            success: true,
            recommendations
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [RECOMMENDATIONS] Error getting recommendations for userId ${req.params.userId}:`, error.message);
        console.error(`[${new Date().toISOString()}] [RECOMMENDATIONS] Error stack:`, error.stack);
        res.status(500).json({ error: 'Failed to get recommendations' });
    }
});

// Time-based kNN recommendation algorithm
async function generateRecommendations(userId, time, day) {
    console.log(`[${new Date().toISOString()}] [KNN] Starting time-based kNN recommendation for user ${userId}`);
    
    const heartsFile = path.join(DATA_DIR, 'hearts.json');
    const dailyHeartsFile = path.join(DATA_DIR, 'daily_hearts.json');
    
    // Load historical KNN heart data
    let knnDiningHallHearts = [];
    let knnMenuItemHearts = [];
    
    if (await fs.pathExists(heartsFile)) {
        const hearts = await fs.readJson(heartsFile);
        knnDiningHallHearts = hearts.knnDiningHallHearts || [];
        knnMenuItemHearts = hearts.knnMenuItemHearts || [];
    }
    
    // Load today's daily heart data
    let dailyDiningHallHearts = [];
    let dailyMenuItemHearts = [];
    
    if (await fs.pathExists(dailyHeartsFile)) {
        const dailyHearts = await fs.readJson(dailyHeartsFile);
        dailyDiningHallHearts = dailyHearts.dailyDiningHallHearts || [];
        dailyMenuItemHearts = dailyHearts.dailyMenuItemHearts || [];
    }
    
    // Combine historical and daily heart data
    const combinedDiningHallHearts = [...knnDiningHallHearts, ...dailyDiningHallHearts];
    const combinedMenuItemHearts = [...knnMenuItemHearts, ...dailyMenuItemHearts];
    
    console.log(`[${new Date().toISOString()}] [KNN] Loaded ${knnDiningHallHearts.length} historical + ${dailyDiningHallHearts.length} daily = ${combinedDiningHallHearts.length} total dining hall hearts`);
    console.log(`[${new Date().toISOString()}] [KNN] Loaded ${knnMenuItemHearts.length} historical + ${dailyMenuItemHearts.length} daily = ${combinedMenuItemHearts.length} total menu item hearts`);
    
    if (combinedDiningHallHearts.length === 0 && combinedMenuItemHearts.length === 0) {
        console.log(`[${new Date().toISOString()}] [KNN] No heart data available (historical + daily), returning empty recommendations`);
        return [];
    }

    const targetDayOfWeek = parseInt(day);
    const targetTime = time;
    const targetVector = [targetDayOfWeek, timeToMinutes(targetTime)];
    
    console.log(`[${new Date().toISOString()}] [KNN] Target vector: [day=${targetDayOfWeek}, time=${targetTime} (${targetVector[1]} minutes)]`);

    // Get user's hearts from combined data (training data)
    const userDiningHearts = combinedDiningHallHearts.filter(h => h.userId === userId);
    const userMenuHearts = combinedMenuItemHearts.filter(h => h.userId === userId);
    
    console.log(`[${new Date().toISOString()}] [KNN] User has ${userDiningHearts.length} dining hall hearts and ${userMenuHearts.length} menu item hearts (combined historical + daily)`);
    
    if (userDiningHearts.length === 0 && userMenuHearts.length === 0) {
        console.log(`[${new Date().toISOString()}] [KNN] User has no hearts in combined data, returning empty recommendations`);
        return [];
    }

    // Run time-based kNN on dining hall hearts
    const diningHallRecommendations = await timeBasedKNN(
        targetVector, userDiningHearts, 'diningHallId', 5
    );
    console.log(`[${new Date().toISOString()}] [KNN] Dining hall time-based kNN found ${Object.keys(diningHallRecommendations).length} recommendations`);

    // Run time-based kNN on menu item hearts (recommend dining halls via menu items)
    const menuItemRecommendations = await timeBasedKNN(
        targetVector, userMenuHearts, 'diningHallId', 8
    );
    console.log(`[${new Date().toISOString()}] [KNN] Menu item time-based kNN found ${Object.keys(menuItemRecommendations).length} recommendations`);

    // Combine recommendations with weights
    const combinedScores = combineRecommendations(
        diningHallRecommendations, 
        menuItemRecommendations, 
        2.0, // dining hall preferences weighted higher
        1.0  // menu item preferences 
    );
    
    console.log(`[${new Date().toISOString()}] [KNN] Combined probabilities:`, 
        Object.entries(combinedScores).map(([hall, prob]) => `Hall ${hall}: ${(prob * 100).toFixed(1)}%`).join(', '));

    // Get top recommendations based on probability distribution (deterministic)
    // Don't force 3 recommendations - return what we actually have
    const recommendations = getTopRecommendationsByProbability(combinedScores, Math.min(3, Object.keys(combinedScores).length));
    
    console.log(`[${new Date().toISOString()}] [KNN] Selected top ${recommendations.length} recommendations by probability (no sample filling)`);
    console.log(`[${new Date().toISOString()}] [KNN] Final recommendation count: ${recommendations.length}`);
    return recommendations;
}

// Time-based kNN algorithm - finds k nearest neighbors in time/day space
async function timeBasedKNN(targetVector, userHearts, labelKey, k) {
    console.log(`[${new Date().toISOString()}] [TIME-KNN] Starting time-based kNN with k=${k} on ${userHearts.length} hearts`);
    
    if (userHearts.length === 0) {
        console.log(`[${new Date().toISOString()}] [TIME-KNN] No hearts available`);
        return {};
    }
    
    // Calculate distances from target vector to all user's hearts
    const distances = userHearts.map(heart => {
        const heartVector = [heart.dayOfWeek, timeToMinutes(heart.timeOfDay)];
        const distance = euclideanDistance(targetVector, heartVector);
        
        return {
            heart,
            distance,
            label: heart[labelKey], // dining hall ID
            vector: heartVector
        };
    });
    
    // Sort by distance and take k nearest neighbors
    distances.sort((a, b) => a.distance - b.distance);
    const neighbors = distances.slice(0, Math.min(k, distances.length));
    
    console.log(`[${new Date().toISOString()}] [TIME-KNN] Found ${neighbors.length} nearest neighbors:`);
    neighbors.forEach((neighbor, i) => {
        const [day, minutes] = neighbor.vector;
        const timeStr = minutesToTime(minutes);
        console.log(`[${new Date().toISOString()}] [TIME-KNN] #${i+1}: Hall ${neighbor.label}, distance=${neighbor.distance.toFixed(2)}, time=[day ${day}, ${timeStr}]`);
    });
    
    if (neighbors.length === 0) {
        return {};
    }
    
    // Calculate inverse distance weights (closer neighbors have higher influence)
    const maxDistance = Math.max(...neighbors.map(n => n.distance)) + 1; // Add 1 to avoid division by 0
    const weightedVotes = {};
    
    neighbors.forEach(neighbor => {
        const label = neighbor.label;
        // Use inverse distance weighting: closer = higher weight
        const weight = 1 / (neighbor.distance + 0.1); // Add small epsilon to avoid division by 0
        
        if (!weightedVotes[label]) {
            weightedVotes[label] = 0;
        }
        weightedVotes[label] += weight;
        
        console.log(`[${new Date().toISOString()}] [TIME-KNN] Added weight ${weight.toFixed(3)} for hall ${label} (distance: ${neighbor.distance.toFixed(2)})`);
    });
    
    // Normalize to probabilities
    const totalWeight = Object.values(weightedVotes).reduce((sum, w) => sum + w, 0);
    const probabilities = {};
    
    Object.entries(weightedVotes).forEach(([label, weight]) => {
        probabilities[label] = weight / totalWeight;
    });
    
    console.log(`[${new Date().toISOString()}] [TIME-KNN] Final probabilities:`, 
        Object.entries(probabilities).map(([hall, prob]) => `Hall ${hall}: ${(prob * 100).toFixed(1)}%`).join(', '));
    
    return probabilities;
}

// Convert time string to minutes since midnight
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

// Convert minutes since midnight back to time string
function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Calculate Euclidean distance between two vectors [day, time_in_minutes]
function euclideanDistance(vector1, vector2) {
    // Normalize day difference to handle week wrap-around (0=Sunday, 6=Saturday)
    const dayDiff = Math.min(
        Math.abs(vector1[0] - vector2[0]),
        7 - Math.abs(vector1[0] - vector2[0])
    );
    
    // Normalize time difference to handle day wrap-around (24-hour cycle)
    const timeDiff = Math.min(
        Math.abs(vector1[1] - vector2[1]),
        1440 - Math.abs(vector1[1] - vector2[1]) // 1440 minutes = 24 hours
    );
    
    // Scale time difference to be comparable with day difference
    // Each day difference ≈ 4 hours of time difference in importance
    const scaledTimeDiff = timeDiff / 240; // Scale to make 4 hours = 1 day
    
    const distance = Math.sqrt(dayDiff * dayDiff + scaledTimeDiff * scaledTimeDiff);
    return distance;
}

// Get top recommendations based on probability distribution (deterministic)
function getTopRecommendationsByProbability(probabilities, count) {
    console.log(`[${new Date().toISOString()}] [TOP_RECOMMENDATIONS] Getting top ${count} recommendations from ${Object.keys(probabilities).length} options by probability`);
    
    if (Object.keys(probabilities).length === 0) {
        return [];
    }
    
    // Sort by probability (highest first) and take top recommendations - deterministic
    const sortedProbs = Object.entries(probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count);
    
    const recommendations = sortedProbs.map(([hallId, probability], index) => {
        const confidence = probability;
        const reason = `${(probability * 100).toFixed(1)}% match based on your time preferences`;
        
        console.log(`[${new Date().toISOString()}] [TOP_RECOMMENDATIONS] #${index + 1}: Hall ${hallId}, probability=${(probability * 100).toFixed(1)}%`);
        
        return {
            diningHallId: parseInt(hallId, 10),
            confidence: confidence,
            reason: reason
        };
    });
    
    return recommendations;
}

// Combine dining hall and menu item probabilities
function combineRecommendations(diningHallProbs, menuItemProbs, alpha, beta) {
    console.log(`[${new Date().toISOString()}] [COMBINE] Combining probabilities with weights - alpha: ${alpha}, beta: ${beta}`);
    console.log(`[${new Date().toISOString()}] [COMBINE] Dining hall probabilities: ${Object.keys(diningHallProbs).length} halls`);
    console.log(`[${new Date().toISOString()}] [COMBINE] Menu item probabilities: ${Object.keys(menuItemProbs).length} halls`);
    
    const combined = {};
    
    // Add dining hall probabilities with alpha weight
    Object.entries(diningHallProbs).forEach(([hallId, prob]) => {
        combined[hallId] = (combined[hallId] || 0) + (alpha * prob);
        console.log(`[${new Date().toISOString()}] [COMBINE] Added dining hall ${hallId}: ${(alpha * prob).toFixed(3)} (weighted by ${alpha})`);
    });
    
    // Add menu item probabilities with beta weight
    Object.entries(menuItemProbs).forEach(([hallId, prob]) => {
        const weightedProb = beta * prob;
        const oldProb = combined[hallId] || 0;
        combined[hallId] = oldProb + weightedProb;
        console.log(`[${new Date().toISOString()}] [COMBINE] Added menu prob for hall ${hallId}: ${weightedProb.toFixed(3)} (total: ${combined[hallId].toFixed(3)})`);
    });
    
    // Normalize to ensure probabilities sum to 1
    const totalWeight = Object.values(combined).reduce((sum, weight) => sum + weight, 0);
    if (totalWeight > 0) {
        Object.keys(combined).forEach(hallId => {
            combined[hallId] = combined[hallId] / totalWeight;
        });
    }
    
    console.log(`[${new Date().toISOString()}] [COMBINE] Final normalized probabilities for ${Object.keys(combined).length} halls`);
    return combined;
}

// Hearts Management API Endpoints

// Get daily hearts for a user
app.get('/api/hearts/daily/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`[${new Date().toISOString()}] [HEARTS] Getting daily hearts for user: ${userId}`);
        
        const filePath = path.join(DATA_DIR, 'daily_hearts.json');
        
        if (!await fs.pathExists(filePath)) {
            console.log(`[${new Date().toISOString()}] [HEARTS] No daily hearts file found`);
            return res.json({ diningHallHearts: [], menuItemHearts: [] });
        }
        
        const hearts = await fs.readJson(filePath);
        
        // Filter hearts for the specific user
        const userDiningHearts = (hearts.dailyDiningHallHearts || []).filter(heart => heart.userId === userId);
        const userMenuHearts = (hearts.dailyMenuItemHearts || []).filter(heart => heart.userId === userId);
        
        console.log(`[${new Date().toISOString()}] [HEARTS] Found ${userDiningHearts.length} dining hall hearts and ${userMenuHearts.length} menu item hearts for user ${userId}`);
        
        res.json({
            diningHallHearts: userDiningHearts,
            menuItemHearts: userMenuHearts
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS] Error getting daily hearts:`, error);
        res.status(500).json({ error: 'Failed to get daily hearts' });
    }
});

// Get KNN hearts for a user
app.get('/api/hearts/knn/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`[${new Date().toISOString()}] [HEARTS] Getting KNN hearts for user: ${userId}`);
        
        const filePath = path.join(DATA_DIR, 'hearts.json');
        
        if (!await fs.pathExists(filePath)) {
            console.log(`[${new Date().toISOString()}] [HEARTS] No KNN hearts file found`);
            return res.json({ diningHallHearts: [], menuItemHearts: [] });
        }
        
        const hearts = await fs.readJson(filePath);
        
        // Filter hearts for the specific user
        const userDiningHearts = (hearts.knnDiningHallHearts || []).filter(heart => heart.userId === userId);
        const userMenuHearts = (hearts.knnMenuItemHearts || []).filter(heart => heart.userId === userId);
        
        console.log(`[${new Date().toISOString()}] [HEARTS] Found ${userDiningHearts.length} KNN dining hall hearts and ${userMenuHearts.length} KNN menu item hearts for user ${userId}`);
        
        res.json({
            diningHallHearts: userDiningHearts,
            menuItemHearts: userMenuHearts
        });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS] Error getting KNN hearts:`, error);
        res.status(500).json({ error: 'Failed to get KNN hearts' });
    }
});

// Remove daily heart
app.delete('/api/hearts/daily/:userId/:type/:heartId', async (req, res) => {
    try {
        const { userId, type, heartId } = req.params;
        console.log(`[${new Date().toISOString()}] [HEARTS] Removing daily ${type} heart ${heartId} for user: ${userId}`);
        
        const filePath = path.join(DATA_DIR, 'daily_hearts.json');
        
        if (!await fs.pathExists(filePath)) {
            console.log(`[${new Date().toISOString()}] [HEARTS] No daily hearts file found`);
            return res.json({ success: true, message: 'Heart not found' });
        }
        
        const hearts = await fs.readJson(filePath);
        
        if (type === 'dining-hall') {
            const originalCount = hearts.dailyDiningHallHearts?.length || 0;
            hearts.dailyDiningHallHearts = hearts.dailyDiningHallHearts?.filter(heart => 
                !(heart.userId === userId && (heart.diningHallId === parseInt(heartId) || heart.diningHallId === heartId))
            ) || [];
            console.log(`[${new Date().toISOString()}] [HEARTS] Removed ${originalCount - hearts.dailyDiningHallHearts.length} dining hall hearts`);
        } else if (type === 'menu-item') {
            const originalCount = hearts.dailyMenuItemHearts?.length || 0;
            hearts.dailyMenuItemHearts = hearts.dailyMenuItemHearts?.filter(heart => 
                !(heart.userId === userId && (heart.menuItemId === parseInt(heartId) || heart.menuItemId === heartId))
            ) || [];
            console.log(`[${new Date().toISOString()}] [HEARTS] Removed ${originalCount - hearts.dailyMenuItemHearts.length} menu item hearts`);
        }
        
        await fs.writeJson(filePath, hearts, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] [HEARTS] Daily hearts updated for user: ${userId}`);
        
        res.json({ success: true, message: 'Heart removed successfully' });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS] Error removing daily heart:`, error);
        res.status(500).json({ error: 'Failed to remove daily heart' });
    }
});

// Remove KNN heart
app.delete('/api/hearts/knn/:userId/:type/:heartId', async (req, res) => {
    try {
        const { userId, type, heartId } = req.params;
        console.log(`[${new Date().toISOString()}] [HEARTS] Removing KNN ${type} heart ${heartId} for user: ${userId}`);
        
        const filePath = path.join(DATA_DIR, 'hearts.json');
        
        if (!await fs.pathExists(filePath)) {
            console.log(`[${new Date().toISOString()}] [HEARTS] No KNN hearts file found`);
            return res.json({ success: true, message: 'Heart not found' });
        }
        
        const hearts = await fs.readJson(filePath);
        
        if (type === 'dining-hall') {
            const originalCount = hearts.knnDiningHallHearts?.length || 0;
            hearts.knnDiningHallHearts = hearts.knnDiningHallHearts?.filter(heart => 
                !(heart.userId === userId && (heart.diningHallId === parseInt(heartId) || heart.diningHallId === heartId))
            ) || [];
            console.log(`[${new Date().toISOString()}] [HEARTS] Removed ${originalCount - hearts.knnDiningHallHearts.length} KNN dining hall hearts`);
        } else if (type === 'menu-item') {
            const originalCount = hearts.knnMenuItemHearts?.length || 0;
            hearts.knnMenuItemHearts = hearts.knnMenuItemHearts?.filter(heart => 
                !(heart.userId === userId && (heart.menuItemId === parseInt(heartId) || heart.menuItemId === heartId))
            ) || [];
            console.log(`[${new Date().toISOString()}] [HEARTS] Removed ${originalCount - hearts.knnMenuItemHearts.length} KNN menu item hearts`);
        }
        
        await fs.writeJson(filePath, hearts, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] [HEARTS] KNN hearts updated for user: ${userId}`);
        
        res.json({ success: true, message: 'Heart removed successfully' });
    } catch (error) {
        console.error(`[${new Date().toISOString()}] [HEARTS] Error removing KNN heart:`, error);
        res.status(500).json({ error: 'Failed to remove KNN heart' });
    }
});

app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Data directory: ${DATA_DIR}`);
    console.log(`[${new Date().toISOString()}] Node environment: ${process.env.NODE_ENV || 'develment'}`);
    
    // Ensure data directory exists and log its status
    fs.ensureDirSync(DATA_DIR);
    console.log(`[${new Date().toISOString()}] Data directory ensured at: ${DATA_DIR}`);
    
    // Check and transfer hearts from previous days on startup
    checkAndTransferPreviousDayHearts()
        .then(() => {
            console.log(`[${new Date().toISOString()}] Heart transfer check completed on startup`);
        })
        .catch(error => {
            console.error(`[${new Date().toISOString()}] Error during startup heart transfer check:`, error);
        });
});