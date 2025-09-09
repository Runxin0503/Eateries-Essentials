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
        const { userId, diningHallId, action } = req.body; // action: 'like' or 'unlike'
        
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        let hearts = {};
        
        if (await fs.pathExists(heartsFile)) {
            hearts = await fs.readJson(heartsFile);
        }

        if (!hearts.diningHalls) hearts.diningHalls = {};
        if (!hearts.diningHalls[userId]) hearts.diningHalls[userId] = [];

        const userHearts = hearts.diningHalls[userId];
        const isLiked = userHearts.includes(diningHallId);

        if (action === 'like' && !isLiked) {
            userHearts.push(diningHallId);
        } else if (action === 'unlike' && isLiked) {
            hearts.diningHalls[userId] = userHearts.filter(id => id !== diningHallId);
        }

        await fs.writeJson(heartsFile, hearts, { spaces: 2 });
        
        res.json({ 
            success: true, 
            isLiked: action === 'like' ? true : false 
        });
    } catch (error) {
        console.error('Error updating dining hall heart:', error.message);
        res.status(500).json({ error: 'Failed to update heart' });
    }
});

// Heart/Like system for menu items
app.post('/api/hearts/menu-item', async (req, res) => {
    try {
        const { userId, menuItemId, action } = req.body; // action: 'like' or 'unlike'
        
        const heartsFile = path.join(DATA_DIR, 'hearts.json');
        let hearts = {};
        
        if (await fs.pathExists(heartsFile)) {
            hearts = await fs.readJson(heartsFile);
        }

        if (!hearts.menuItems) hearts.menuItems = {};
        if (!hearts.menuItems[userId]) hearts.menuItems[userId] = [];

        const userHearts = hearts.menuItems[userId];
        const isLiked = userHearts.includes(menuItemId);

        if (action === 'like' && !isLiked) {
            userHearts.push(menuItemId);
        } else if (action === 'unlike' && isLiked) {
            hearts.menuItems[userId] = userHearts.filter(id => id !== menuItemId);
        }

        await fs.writeJson(heartsFile, hearts, { spaces: 2 });
        
        res.json({ 
            success: true, 
            isLiked: action === 'like' ? true : false 
        });
    } catch (error) {
        console.error('Error updating menu item heart:', error.message);
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

app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Data directory: ${DATA_DIR}`);
    console.log(`[${new Date().toISOString()}] Node environment: ${process.env.NODE_ENV || 'develment'}`);
    
    // Ensure data directory exists and log its status
    fs.ensureDirSync(DATA_DIR);
    console.log(`[${new Date().toISOString()}] Data directory ensured at: ${DATA_DIR}`);
});