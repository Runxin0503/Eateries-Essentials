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

// Heart/Like system for dining halls
app.post('/api/hearts/dining-hall', async (req, res) => {
    try {
        const { userId, diningHallId: rawDiningHallId, action } = req.body; // action: 'like' or 'unlike'
        const diningHallId = parseInt(rawDiningHallId, 10); // Ensure numeric ID
        
        console.log(`[${new Date().toISOString()}] [HEARTS-DINING] User ${userId} ${action} dining hall ${diningHallId}`);
        
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        let hearts = {};
        
        if (await fs.pathExists(heartsFile)) {
            hearts = await fs.readJson(heartsFile);
        }

        // Initialize new structure with detailed records
        if (!hearts.diningHallHearts) hearts.diningHallHearts = [];
        if (!hearts.diningHalls) hearts.diningHalls = {}; // Keep old structure for compatibility
        if (!hearts.diningHalls[userId]) hearts.diningHalls[userId] = [];

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const timeOfDay = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Context: Day ${dayOfWeek}, Time ${timeOfDay}`);

        const userHearts = hearts.diningHalls[userId];
        const isLiked = userHearts.includes(diningHallId);

        if (action === 'like' && !isLiked) {
            // Add to old structure for compatibility
            userHearts.push(diningHallId);
            
            // Add to new detailed structure
            const heartRecord = {
                userId,
                diningHallId,
                dayOfWeek,
                timeOfDay,
                timestamp: now.toISOString()
            };
            hearts.diningHallHearts.push(heartRecord);
            
            console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Added heart record:`, heartRecord);
        } else if (action === 'unlike' && isLiked) {
            // Remove from old structure
            hearts.diningHalls[userId] = userHearts.filter(id => id !== diningHallId);
            
            // Remove from new structure (remove all instances for this user/hall combo)
            const beforeCount = hearts.diningHallHearts.length;
            hearts.diningHallHearts = hearts.diningHallHearts.filter(
                heart => !(heart.userId === userId && heart.diningHallId === diningHallId)
            );
            const removedCount = beforeCount - hearts.diningHallHearts.length;
            
            console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Removed ${removedCount} heart records for user ${userId}, hall ${diningHallId}`);
        }

        await fs.writeJson(heartsFile, hearts, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] [HEARTS-DINING] Hearts file updated. Total dining hall hearts: ${hearts.diningHallHearts.length}`);
        
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
        
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        let hearts = {};
        
        if (await fs.pathExists(heartsFile)) {
            hearts = await fs.readJson(heartsFile);
        }

        // Initialize new structure with detailed records
        if (!hearts.menuItemHearts) hearts.menuItemHearts = [];
        if (!hearts.menuItems) hearts.menuItems = {}; // Keep old structure for compatibility
        if (!hearts.menuItems[userId]) hearts.menuItems[userId] = [];

        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const timeOfDay = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Context: Day ${dayOfWeek}, Time ${timeOfDay}`);

        const userMenuHearts = hearts.menuItems[userId];
        const isMenuLiked = userMenuHearts.includes(menuItemId);

        if (action === 'like' && !isMenuLiked) {
            // Add to old structure for compatibility
            userMenuHearts.push(menuItemId);
            
            // Add to new detailed structure
            const heartRecord = {
                userId,
                menuItemId,
                diningHallId: diningHallId || 'unknown', // Store which dining hall this menu item was from
                dayOfWeek,
                timeOfDay,
                timestamp: now.toISOString()
            };
            hearts.menuItemHearts.push(heartRecord);
            
            console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Added heart record:`, heartRecord);
        } else if (action === 'unlike' && isMenuLiked) {
            // Remove from old structure
            hearts.menuItems[userId] = userMenuHearts.filter(id => id !== menuItemId);
            
            // Remove from new structure (remove all instances for this user/menu item combo)
            const beforeCount = hearts.menuItemHearts.length;
            hearts.menuItemHearts = hearts.menuItemHearts.filter(
                heart => !(heart.userId === userId && heart.menuItemId === menuItemId)
            );
            const removedCount = beforeCount - hearts.menuItemHearts.length;
            
            console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Removed ${removedCount} heart records for user ${userId}, menu item ${menuItemId}`);
        }

        await fs.writeJson(heartsFile, hearts, { spaces: 2 });
        console.log(`[${new Date().toISOString()}] [HEARTS-MENU] Hearts file updated. Total menu item hearts: ${hearts.menuItemHearts.length}`);
        
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

// Get user's hearts
app.get('/api/hearts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        
        if (!(await fs.pathExists(heartsFile))) {
            return res.json({ diningHalls: [], menuItems: [] });
        }

        const hearts = await fs.readJson(heartsFile);
        
        res.json({
            diningHalls: hearts.diningHalls?.[userId] || [],
            menuItems: hearts.menuItems?.[userId] || []
        });
    } catch (error) {
        console.error('Error getting hearts:', error.message);
        res.status(500).json({ error: 'Failed to get hearts' });
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
    
    if (!(await fs.pathExists(heartsFile))) {
        console.log(`[${new Date().toISOString()}] [KNN] No hearts file found, returning sample recommendations`);
        return getSampleRecommendations();
    }

    const hearts = await fs.readJson(heartsFile);
    
    // Use new detailed structure if available, fallback to old structure
    const diningHallHearts = hearts.diningHallHearts || [];
    const menuItemHearts = hearts.menuItemHearts || [];
    
    console.log(`[${new Date().toISOString()}] [KNN] Loaded ${diningHallHearts.length} dining hall hearts and ${menuItemHearts.length} menu item hearts`);
    
    if (diningHallHearts.length === 0 && menuItemHearts.length === 0) {
        console.log(`[${new Date().toISOString()}] [KNN] No heart data available, returning sample recommendations`);
        return getSampleRecommendations();
    }

    const targetDayOfWeek = parseInt(day);
    const targetTime = time;
    const targetVector = [targetDayOfWeek, timeToMinutes(targetTime)];
    
    console.log(`[${new Date().toISOString()}] [KNN] Target vector: [day=${targetDayOfWeek}, time=${targetTime} (${targetVector[1]} minutes)]`);

    // Get user's hearts (training data)
    const userDiningHearts = diningHallHearts.filter(h => h.userId === userId);
    const userMenuHearts = menuItemHearts.filter(h => h.userId === userId);
    
    console.log(`[${new Date().toISOString()}] [KNN] User has ${userDiningHearts.length} dining hall hearts and ${userMenuHearts.length} menu item hearts`);
    
    if (userDiningHearts.length === 0 && userMenuHearts.length === 0) {
        console.log(`[${new Date().toISOString()}] [KNN] User has no hearts, returning sample recommendations`);
        return getSampleRecommendations();
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

    // Sample top 3 recommendations based on probability distribution
    const recommendations = sampleTopRecommendations(combinedScores, 3);
    
    console.log(`[${new Date().toISOString()}] [KNN] Sampled ${recommendations.length} recommendations`);

    // Fill with sample recommendations if needed
    while (recommendations.length < 3) {
        const sampleRecs = getSampleRecommendations();
        const existingIds = recommendations.map(r => r.diningHallId);
        const newRec = sampleRecs.find(r => !existingIds.includes(r.diningHallId));
        if (newRec) {
            newRec.confidence = Math.max(0.1, newRec.confidence - 0.3);
            recommendations.push(newRec);
            console.log(`[${new Date().toISOString()}] [KNN] Added sample recommendation: Hall ${newRec.diningHallId}`);
        } else {
            break;
        }
    }

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

// Sample top recommendations based on probability distribution
function sampleTopRecommendations(probabilities, count) {
    console.log(`[${new Date().toISOString()}] [SAMPLING] Sampling top ${count} recommendations from ${Object.keys(probabilities).length} options`);
    
    if (Object.keys(probabilities).length === 0) {
        return [];
    }
    
    // Sort by probability and take top recommendations
    const sortedProbs = Object.entries(probabilities)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count);
    
    const recommendations = sortedProbs.map(([hallId, probability], index) => {
        const confidence = probability;
        const reason = `${(probability * 100).toFixed(1)}% match based on your time preferences`;
        
        console.log(`[${new Date().toISOString()}] [SAMPLING] #${index + 1}: Hall ${hallId}, probability=${(probability * 100).toFixed(1)}%`);
        
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

function getSampleRecommendations() {
    const sampleHalls = [
        { diningHallId: 1, confidence: 0.7, reason: 'Popular choice for this time' },
        { diningHallId: 2, confidence: 0.6, reason: 'Great variety available' },
        { diningHallId: 3, confidence: 0.5, reason: 'Convenient location' }
    ];
    
    // Shuffle and return up to 3
    return sampleHalls.sort(() => Math.random() - 0.5).slice(0, 3);
}

app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Data directory: ${DATA_DIR}`);
    console.log(`[${new Date().toISOString()}] Node environment: ${process.env.NODE_ENV || 'develment'}`);
    
    // Ensure data directory exists and log its status
    fs.ensureDirSync(DATA_DIR);
    console.log(`[${new Date().toISOString()}] Data directory ensured at: ${DATA_DIR}`);
});