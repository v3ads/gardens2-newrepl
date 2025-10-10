-- This is just to check the actual schema
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'job_queue' 
ORDER BY ordinal_position;
