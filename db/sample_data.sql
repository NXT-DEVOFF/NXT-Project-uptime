-- Sample data for project_tracker database
USE project_tracker;

INSERT INTO projects (name, description, status, progress_percentage, start_date, target_end_date) VALUES
('NXT Website Redesign', 'Redesign of the company website with modern UI/UX', 'in_progress', 45, '2024-01-15', '2024-06-30'),
('Mobile App MVP', 'Minimum viable product for customer engagement app', 'planning', 10, '2024-02-01', '2024-08-31'),
('Data Analytics Dashboard', 'Internal dashboard for tracking KPIs', 'review', 80, '2024-01-01', '2024-04-30'),
('API Gateway Implementation', 'Secure API gateway for microservices', 'on_hold', 0, '2024-03-01', '2024-09-30'),
('Machine Learning Model', 'Predictive model for sales forecasting', 'in_progress', 60, '2024-02-15', '2024-07-15');