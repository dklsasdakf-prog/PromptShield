-- PromptShield Database Initialization
-- This script sets up the initial database schema

-- Create the database if it doesn't exist (this runs automatically via POSTGRES_DB)
-- The database 'pshield' is already created by the POSTGRES_DB environment variable

-- Set timezone
SET timezone = 'UTC';

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create basic indexes for performance
-- Note: Actual table creation will be handled by Alembic migrations

-- Log the initialization
INSERT INTO information_schema.sql_features (feature_id, feature_name, sub_feature_id, sub_feature_name, is_supported, comments)
VALUES ('PSHIELD001', 'PromptShield Database Initialized', NULL, NULL, 'YES', 'Database initialized at ' || NOW())
ON CONFLICT DO NOTHING;

-- Success message
\echo 'PromptShield PostgreSQL database initialized successfully!'