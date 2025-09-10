// server-simple.js - Fallback version without database
const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Test route
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'IMTTI Server is running!', 
        status: 'success',
        database: 'disabled',
        timestamp: new Date().toISOString()
    });
});

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        message: 'Server is running properly',
        database: 'disabled'
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(port, () => {
    console.log(`🚀 IMTTI Server (Simple) running on port ${port}`);
    console.log(`📱 Website: https://imtti1-production.up.railway.app/`);
    console.log(`⚠️ Database disabled - using localStorage fallback`);
});
