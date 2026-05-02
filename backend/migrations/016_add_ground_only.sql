-- Add ground_only mode for tracking optimization
ALTER TABLE query_schedule 
ADD COLUMN IF NOT EXISTS ground_only BOOLEAN DEFAULT FALSE;
