require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const redis = require('redis');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Joi = require('joi');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS configuration - restrict to frontend origin in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL || 'https://yourdomain.com']
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' })); // Limit request body size

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Database connection pool
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'project_tracker',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Redis client
let redisClient;
(async () => {
  try {
    redisClient = redis.createClient({
      url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));

    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    // Continue without Redis for now - caching will be disabled
  }
})();

// Test DB connection
(async () => {
  try {
    const connection = await dbPool.getConnection();
    console.log('Connected to MySQL database');
    connection.release();
  } catch (err) {
    console.error('Database connection failed:', err);
    // Don't exit - allow app to start for debugging
  }
})();

// Validation schemas
const projectSchema = Joi.object({
  name: Joi.string().min(1).max(255).required().trim(),
  description: Joi.string().max(1000).allow(null, ''),
  status: Joi.string().valid('planning', 'in_progress', 'review', 'completed', 'on_hold').default('planning'),
  progress_percentage: Joi.number().integer().min(0).max(100).default(0),
  start_date: Joi.date().iso().allow(null, ''),
  target_end_date: Joi.date().iso().allow(null, '')
});

// Helper function to validate date strings
const isValidDateString = (dateString) => {
  if (!dateString || dateString === '') return true;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    // Try to get from Redis cache first
    let cached = null;
    if (redisClient && redisClient.isOpen) {
      try {
        cached = await redisClient.get('projects');
      } catch (cacheErr) {
        console.warn('Redis get error:', cacheErr.message);
      }
    }

    if (cached) {
      try {
        return res.json(JSON.parse(cached));
      } catch (parseErr) {
        console.warn('Failed to parse cached data:', parseErr.message);
        // Continue to fetch from database
      }
    }

    // Fetch from database
    const [rows] = await dbPool.query(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );

    // Cache for 5 minutes
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.setEx('projects', 300, JSON.stringify(rows));
      } catch (cacheErr) {
        console.warn('Redis setex error:', cacheErr.message);
      }
    }

    res.json(rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get project by ID
app.get('/api/projects/:id', async (req, res) => {
  try {
    // Validate ID is a positive integer
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const [rows] = await dbPool.query(
      'SELECT * FROM projects WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new project
app.post('/api/projects', async (req, res) => {
  try {
    // Validate input
    const { error, value } = projectSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
    }

    const { name, description, status, progress_percentage, start_date, target_end_date } = value;

    // Additional date validation
    if ((start_date && !isValidDateString(start_date)) ||
        (target_end_date && !isValidDateString(target_end_date))) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Ensure start_date is not after target_end_date if both are provided
    if (start_date && target_end_date &&
        new Date(start_date) > new Date(target_end_date)) {
      return res.status(400).json({ error: 'Start date cannot be after target end date' });
    }

    const [result] = await dbPool.query(
      `INSERT INTO projects (name, description, status, progress_percentage, start_date, target_end_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, status, progress_percentage,
       start_date || null, target_end_date || null]
    );

    // Clear cache
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.del('projects');
      } catch (cacheErr) {
        console.warn('Redis del error:', cacheErr.message);
      }
    }

    res.status(201).json({
      id: result.insertId,
      name,
      description: description || null,
      status,
      progress_percentage,
      start_date: start_date || null,
      target_end_date: target_end_date || null
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update project
app.put('/api/projects/:id', async (req, res) => {
  try {
    // Validate ID
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Validate input
    const { error, value } = projectSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
    }

    const { name, description, status, progress_percentage, start_date, target_end_date } = value;

    // Additional date validation
    if ((start_date && !isValidDateString(start_date)) ||
        (target_end_date && !isValidDateString(target_end_date))) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Ensure start_date is not after target_end_date if both are provided
    if (start_date && target_end_date &&
        new Date(start_date) > new Date(target_end_date)) {
      return res.status(400).json({ error: 'Start date cannot be after target end date' });
    }

    const [result] = await dbPool.query(
      `UPDATE projects SET
       name = ?,
       description = ?,
       status = ?,
       progress_percentage = ?,
       start_date = ?,
       target_end_date = ?,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || null, description || null, status, progress_percentage,
       start_date || null, target_end_date || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Clear cache
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.del('projects');
      } catch (cacheErr) {
        console.warn('Redis del error:', cacheErr.message);
      }
    }

    res.json({
      message: 'Project updated successfully',
      changes: result.affectedRows
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    // Validate ID
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const [result] = await dbPool.query('DELETE FROM projects WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Clear cache
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.del('projects');
      } catch (cacheErr) {
        console.warn('Redis del error:', cacheErr.message);
      }
    }

    res.json({
      message: 'Project deleted successfully',
      deletedCount: result.affectedRows
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`CORS restricted to: ${process.env.FRONTEND_URL || 'production domain'}`);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(async (err) => {
    if (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }

    // Close database connections
    try {
      await dbPool.end();
    } catch (err) {
      console.error('Error closing database pool:', err);
    }

    // Close Redis connection
    if (redisClient && redisClient.isOpen) {
      try {
        await redisClient.quit();
      } catch (err) {
        console.error('Error closing Redis connection:', err);
      }
    }

    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.emit('SIGTERM');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit here - let the app continue but log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});