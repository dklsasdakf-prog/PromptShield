-- Initialize PromptShield database
-- This script runs when the PostgreSQL container starts for the first time

-- Create database if it doesn't exist (handled by POSTGRES_DB env var)

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a sample user table (you can modify this based on your actual schema)
-- This is just to verify the database is working
CREATE TABLE IF NOT EXISTS health_check (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    message TEXT
);

-- Insert a test record
INSERT INTO health_check (message) VALUES ('Database initialized successfully');

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE pshield TO postgres;