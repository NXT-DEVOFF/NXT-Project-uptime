# NXT Project Tracker

A secure full-stack web application for sharing project progress with friends and teammates.

## 🔒 Security Features

This application implements multiple security layers to protect against common vulnerabilities:

### Backend Security
- **Input Validation**: All inputs validated using Joi schema validation
- **SQL Injection Prevention**: Parameterized queries only
- **XSS Protection**: Helmet.js security headers + React's built-in XSS protection
- **Rate Limiting**: Express-rate-limit prevents brute force and DoS attacks
- **CORS Protection**: Restricted origins in production
- **Security Headers**: Helmet.js sets various HTTP security headers
- **Error Handling**: Generic error messages prevent information leakage
- **Request Size Limits**: Built-in Express JSON parsing limits
- **SQL Injection**: Parameterized queries prevent injection attacks

### Frontend Security
- **XSS Prevention**: React automatically escapes content
- **Input Sanitization**: Client-side validation complements server-side checks
- **Safe API Calls**: Proper error handling and timeout considerations
- **Environment Variable Validation**: Ensures required config is present

### Dependencies
- All packages are up-to-date with known vulnerabilities monitored
- No dangerous eval() or similar patterns
- Secure defaults for all libraries used

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, MySQL2, Redis
- **Security**: Helmet, Joi, Express-rate-limit, CORS
- **Deployment**: PM2 process manager

## Project Structure

```
.
├── frontend/          # React/Vite application
├── backend/           # Express API server with security enhancements
├── python/            # Python utility scripts
├── db/                # Database schema and migrations
├── ecosystem.config.js # PM2 configuration
└── README.md
```

## Prerequisites

- Node.js

- MySQL (v5.7+ or v8+)
- Redis (v3.8+

- Node.js (v16+)
- MySQL (v5.7+ or v8+)
- Redis (v4+)
- Python (v3.8+)

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd NXT-Project-uptime
```

### 2. Install dependencies

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd ../frontend
npm install
```

#### Python (optional)
```bash
cd ../python
pip install -r requirements.txt
```

### 3. Configure environment

#### Backend Security Configuration
Copy `.env.example` to `.env` and configure:
```bash
cd backend
cp .env.example .env
# Edit .env with your settings
```

Key security-related environment variables:
- `HOST=0.0.0.0` (binds to all interfaces - for VPS access)
- `PORT=5000`
- `FRONTEND_URL=https://yourdomain.com` (for CORS restriction in production)
- Database credentials (use strong passwords!)
- Redis connection details (consider enabling AUTH in production)

#### Frontend Configuration
```bash
cd ../frontend
cp .env.example .env
# Edit .env to set VITE_API_URL=http://your-vps-ip:5000/api
```

### 4. Database setup

1. Ensure MySQL is running
2. Create database and tables:
```bash
mysql -u root -p < db/init.sql
```
3. (Optional) Insert sample data:
```bash
mysql -u root -p project_tracker < db/sample_data.sql
```

### 5. Redis setup

Ensure Redis is running on the default port (6379) or update the `.env` file.
For production, consider:
- Enabling Redis AUTH
- Binding to localhost only
- Using a firewall to restrict access

## 🔐 Security Best Practices for Deployment

### 1. Environment Security
- **Never** commit `.env` files to version control
- Use strong, randomly generated passwords for DB and Redis
- Consider using environment-specific files (`.env.production`, `.env.staging`)

### 2. Network Security
- Bind services to appropriate interfaces (use `HOST=0.0.0.0` only when behind firewall/router)
- Consider using a reverse proxy (NGINX/Caddy) for SSL termination
- Restrict database and Redis access to localhost or specific IPs
- Use firewall rules (ufw/iptables) to limit access

### 3. HTTPS/SSL
- Terminate SSL at reverse proxy level (Let's Encrypt recommended)
- Force HTTPS redirects
- Use strong SSL/TLS configurations
- Enable HTTP/2 for better performance

### 4. Database Security
- Use least-privilege database user
- Enable MySQL/MariaDB audit logging if needed
- Consider enabling SSL for database connections
- Regular backups with encryption

### 5. Redis Security (if exposed)
- Enable AUTH requirement
- Rename/disable dangerous commands
- Bind to localhost only
- Use firewall to restrict access

### 6. Monitoring & Maintenance
- Enable logging and monitor for suspicious activity
- Keep all dependencies updated (`npm audit` regularly)
- Set up automated security scanning
- Monitor resources and set up alerts

## Development

### Start backend in development mode
```bash
cd backend
npm run dev
```

### Start frontend in development mode
```bash
cd frontend
npm run dev
```

The frontend will be available at `http://localhost:5173` and the API at `http://localhost:5000/api`.

## Production Deployment with PM2

### 1. Build the applications

#### Backend
No build step needed.

#### Frontend
```bash
cd frontend
npm run build
```

### 2. Start with PM2

From the project root:
```bash
# Install PM2 globally if not already installed
npm install -g pm2

# Start both applications with production environment
pm2 start ecosystem.config.js --env production

# Save the process list for auto-restart on server reboot
pm2 save

# Set up PM2 to start on boot (platform-specific)
pm2 startup
```

### 3. Access your application

After deployment:
- Frontend: `http://your-vps-ip-or-domain` (served on port 3000 via production script)
- API: `http://your-vps-ip-or-domain:5000/api`
- Health check: `http://your-vps-ip-or-domain:5000/api/health`

### 4. Manage processes

```bash
# View all processes
pm2 list

# View logs for a specific app
pm2 logs nxt-backend
pm2 logs nxt-frontend

# Restart an app
pm2 restart nxt-backend
pm2 restart nxt-frontend

# Stop an app
pm2 stop nxt-backend
pm2 stop nxt-frontend

# Delete an app from PM2
pm2 delete nxt-backend
pm2 delete nxt-frontend
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/projects` - Get all projects (with Redis caching)
- `GET /api/projects/:id` - Get project by ID
- `POST /api/projects` - Create new server-chk1b51fll1sx1m0a
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

## Python Scripts

The `python/` directory contains utility scripts for data processing and maintenance.

Example usage:
```bash
cd python
python data_processor.py
```

## Security Testing

Before deploying to production, consider running:
```bash
# Check for known vulnerabilities in dependencies
npm audit

# For more detailed audit
npm audit --production

# Consider using additional security scanning tools
# npm install -g audit-ci
# audit-ci
```

## License

MIT

## Security Policy

If you discover a security vulnerability, please report it immediately. We take security seriously and will investigate any reported issues.

## Acknowledgments

- Built with ❤️ for tracking project progress
- Special thanks to all open-source projects used
- Security best practices from OWASP and similar organizations