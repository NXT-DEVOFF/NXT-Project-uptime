// Mock database and redis for testing
jest.mock('mysql2/promise', () => {
  return {
    createPool: jest.fn().mockReturnValue({
      query: jest.fn(),
      getConnection: jest.fn().mockResolvedValue({
        release: jest.fn()
      }),
      end: jest.fn()
    })
  };
});

jest.mock('redis', () => {
  return {
    createClient: jest.fn().mockReturnValue({
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(true),
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      quit: jest.fn()
    })
  };
});

const request = require('supertest');
const { Pool } = require('mysql2/promise');
const redis = require('redis');

describe('Project Endpoints', () => {
  let app;
  let mockPool;
  let mockRedisClient;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Re-import the app to get fresh instances
    // We need to reset the module cache
    jest.isolateModules(() => {
      app = require('../server');
    });

    mockPool = new Pool();
    mockRedisClient = redis.createClient();
  });

  describe('GET /api/health', () => {
    it('should return OK status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/projects', () => {
    it('should return projects from cache if available', async () => {
      const mockProjects = [{ id: 1, name: 'Test Project' }];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockProjects));

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProjects);
      expect(mockRedisClient.get).toHaveBeenCalledWith('projects');
    });

    it('should fetch from database when cache is empty', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const mockProjects = [{ id: 1, name: 'Test Project', description: 'A test' }];
      mockPool.query.mockResolvedValue([mockProjects]);

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProjects);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM projects ORDER BY created_at DESC');
      expect(mockRedisClient.setEx).toHaveBeenCalledWith('projects', 300, JSON.stringify(mockProjects));
    });

    it('should handle database errors gracefully', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/projects');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Internal server error');
    });
  });

  describe('POST /api/projects', () => {
    it('should create a new project with valid data', async () => {
      const newProject = {
        name: 'New Project',
        description: 'A new test project',
        status: 'planning',
        progress_percentage: 0
      };

      mockPool.query.mockResolvedValue([{ insertId: 1 }]);

      const response = await request(app)
        .post('/api/projects')
        .send(newProject);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body.name).toBe(newProject.name);
      expect(mockPool.query).toHaveBeenCalledWith(
        `INSERT INTO projects (name, description, status, progress_percentage, start_date, target_end_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newProject.name, newProject.description, newProject.status, newProject.progress_percentage, null, null]
      );
    });

    it('should return 400 for missing project name', async () => {
      const invalidProject = {
        description: 'A project without name',
        status: 'planning'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidProject);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body.details).toContain('"name" is required');
    });

    it('should return 400 for invalid status', async () => {
      const invalidProject = {
        name: 'Test Project',
        status: 'invalid_status'
      };

      const response = await request(app)
        .post('/api/projects')
        .send(invalidProject);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
    });
  });
});