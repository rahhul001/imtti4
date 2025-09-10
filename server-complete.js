// server-complete.js - Complete IMTTI Server with Database Integration
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for photo uploads
app.use(express.static('.'));

// Database connection
const dbConfig = {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    ssl: {
        rejectUnauthorized: false
    },
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

async function initDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        console.log('✅ Database connected successfully');

        // Test connection with timeout
        const testConnection = await Promise.race([
            pool.execute('SELECT 1 as test'),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Database connection timeout')), 10000)
            )
        ]);
        
        console.log('✅ Database test query successful');

        // Create tables if they don't exist
        await createTables();
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        console.log('⚠️ Running without database - using localStorage fallback');
        pool = null;
    }
}

async function createTables() {
    const tables = [
        {
            name: 'centers',
            sql: `CREATE TABLE IF NOT EXISTS centers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                location VARCHAR(255),
                contact_person VARCHAR(255),
                phone VARCHAR(20),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`
        },
        {
            name: 'students',
            sql: `CREATE TABLE IF NOT EXISTS students (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(20),
                date_of_birth DATE,
                center_id INT,
                photo TEXT,
                registration_id VARCHAR(50) UNIQUE,
                course VARCHAR(100) DEFAULT 'Diploma Program',
                status VARCHAR(50) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (center_id) REFERENCES centers(id)
            )`
        },
        {
            name: 'applications',
            sql: `CREATE TABLE IF NOT EXISTS applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                application_number VARCHAR(50) UNIQUE NOT NULL,
                student_id INT,
                center_id INT,
                data JSON,
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id),
                FOREIGN KEY (center_id) REFERENCES centers(id)
            )`
        },
        {
            name: 'marks',
            sql: `CREATE TABLE IF NOT EXISTS marks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT,
                subject VARCHAR(255) NOT NULL,
                marks INT,
                grade VARCHAR(10),
                center_id INT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (student_id) REFERENCES students(id),
                FOREIGN KEY (center_id) REFERENCES centers(id)
            )`
        },
        {
            name: 'admins',
            sql: `CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`
        }
    ];

    try {
        // Create tables one by one
        for (const table of tables) {
            await pool.execute(table.sql);
            console.log(`✅ Table ${table.name} created successfully`);
        }

        // Insert default admin
        await pool.execute(`
            INSERT IGNORE INTO admins (name, email, password)
            VALUES ('IMTTI Administrator', 'admin@imtti.com', 'admin123')
        `);
        console.log('✅ Default admin created successfully');
        
        console.log('✅ All database tables created successfully');
    } catch (error) {
        console.error('❌ Error creating tables:', error);
    }
}

// Test route
app.get('/api/test', (req, res) => {
    res.json({ 
        message: 'IMTTI Server is running!', 
        status: 'success',
        database: pool ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        message: 'Server is running properly',
        database: pool ? 'connected' : 'disconnected'
    });
});

// API Routes

// Centers
app.get('/api/centers', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const [rows] = await pool.execute('SELECT * FROM centers ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/centers', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { name, email, password, location, contact_person, phone } = req.body;    
        const [result] = await pool.execute(
            'INSERT INTO centers (name, email, password, location, contact_person, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [name, email, password, location, contact_person, phone]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/centers/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { id } = req.params;
        const { name, email, location, contact_person, phone, is_active } = req.body;
        await pool.execute(
            'UPDATE centers SET name = ?, email = ?, location = ?, contact_person = ?, phone = ?, is_active = ? WHERE id = ?',
            [name, email, location, contact_person, phone, is_active, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Students
app.get('/api/students', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const [rows] = await pool.execute(`
            SELECT s.*, c.name as center_name 
            FROM students s 
            LEFT JOIN centers c ON s.center_id = c.id 
            ORDER BY s.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/students', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { name, email, phone, date_of_birth, center_id, photo, registration_id, course } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO students (name, email, phone, date_of_birth, center_id, photo, registration_id, course) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, phone, date_of_birth, center_id, photo, registration_id, course || 'Diploma Program']
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/students/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { id } = req.params;
        const { name, email, phone, date_of_birth, photo, course, status } = req.body;
        await pool.execute(
            'UPDATE students SET name = ?, email = ?, phone = ?, date_of_birth = ?, photo = ?, course = ?, status = ? WHERE id = ?',
            [name, email, phone, date_of_birth, photo, course, status, id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Applications
app.get('/api/applications', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const [rows] = await pool.execute(`
            SELECT a.*, s.name as student_name, c.name as center_name 
            FROM applications a 
            LEFT JOIN students s ON a.student_id = s.id 
            LEFT JOIN centers c ON a.center_id = c.id 
            ORDER BY a.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/applications', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { application_number, student_id, center_id, data, status } = req.body;   
        const [result] = await pool.execute(
            'INSERT INTO applications (application_number, student_id, center_id, data, status) VALUES (?, ?, ?, ?, ?)',
            [application_number, student_id, center_id, JSON.stringify(data), status || 'pending']
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/applications/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { id } = req.params;
        const { status, data } = req.body;
        await pool.execute(
            'UPDATE applications SET status = ?, data = ? WHERE id = ?',
            [status, JSON.stringify(data), id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Marks
app.get('/api/marks', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const [rows] = await pool.execute(`
            SELECT m.*, s.name as student_name, c.name as center_name 
            FROM marks m 
            LEFT JOIN students s ON m.student_id = s.id 
            LEFT JOIN centers c ON m.center_id = c.id 
            ORDER BY m.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/marks', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { student_id, subject, marks, grade, center_id } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO marks (student_id, subject, marks, grade, center_id) VALUES (?, ?, ?, ?, ?)',
            [student_id, subject, marks, grade, center_id]
        );
        res.json({ id: result.insertId, ...req.body });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admins
app.get('/api/admins', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const [rows] = await pool.execute('SELECT * FROM admins');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Authentication
app.post('/api/auth/admin', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { email, password } = req.body;
        const [rows] = await pool.execute(
            'SELECT * FROM admins WHERE email = ? AND password = ?',
            [email, password]
        );
        if (rows.length > 0) {
            res.json({ success: true, user: rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });   
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/center', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { email, password } = req.body;
        const [rows] = await pool.execute(
            'SELECT * FROM centers WHERE email = ? AND password = ? AND is_active = true',
            [email, password]
        );
        if (rows.length > 0) {
            res.json({ success: true, user: rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });   
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/student', async (req, res) => {
    try {
        if (!pool) {
            return res.status(503).json({ error: 'Database not connected' });
        }
        const { registration_id, date_of_birth } = req.body;
        const [rows] = await pool.execute(
            'SELECT * FROM students WHERE registration_id = ? AND date_of_birth = ?',   
            [registration_id, date_of_birth]
        );
        if (rows.length > 0) {
            res.json({ success: true, user: rows[0] });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });   
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    if (pool) {
        pool.end().then(() => {
            console.log('✅ Database connection closed');
            process.exit(0);
        }).catch((err) => {
            console.error('❌ Error closing database connection:', err);
            process.exit(1);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    if (pool) {
        pool.end().then(() => {
            console.log('✅ Database connection closed');
            process.exit(0);
        }).catch((err) => {
            console.error('❌ Error closing database connection:', err);
            process.exit(1);
        });
    } else {
        process.exit(0);
    }
});

// Initialize database and start server
initDatabase().then(() => {
    const server = app.listen(PORT, () => {
        console.log(`🚀 IMTTI Server running on port ${PORT}`);
        console.log(`📱 Website: https://imtti4-production.up.railway.app/`);
    });

    // Handle server errors
    server.on('error', (err) => {
        console.error('❌ Server error:', err);
        if (err.code === 'EADDRINUSE') {
            console.log('⚠️ Port already in use, trying alternative port...');
        }
    });
}).catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
