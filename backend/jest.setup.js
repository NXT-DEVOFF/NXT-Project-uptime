// jest.setup.js
// Set up any global mocks or configurations for tests

// Mock environment variables for testing
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test_db';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.HOST = '0.0.0.0';
process.env.PORT = '5000';
process.env.NODE_ENV = 'test';