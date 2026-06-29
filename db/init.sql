-- Database schema for project tracker
CREATE DATABASE IF NOT EXISTS project_tracker;
USE project_tracker;

CREATE TABLE IF NOT EXISTS projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status ENUM('planning', 'in_progress', 'review', 'completed', 'on_hold') DEFAULT 'planning',
    progress_percentage INT DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
    start_date DATE,
    target_end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert some sample projects
INSERT INTO projects (name, description, status, progress_percentage, start_date, target_end_date) VALUES
('NXT Website Redesign', 'Redesign of the company website with modern UI/UX', 'in_progress', 45, '2024-01-15', '2024-06-30'),
('Mobile App MVP', 'Minimum viable product for customer engagement app', 'planning', 10, '2024-02-01', '2024-08-31'),
('Data Analytics Dashboard', 'Internal dashboard for tracking KPIs', 'review', 80, '2024-01-01', '2024-04-30'),
('API Gateway Implementation', 'Secure API gateway for microservices', 'on_hold', 0, '2024-03-01', '2024-09-30');

-- Indexes for better query performance
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at);