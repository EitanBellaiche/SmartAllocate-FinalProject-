BEGIN;

-- Add generic requester_id column
ALTER TABLE resource_requests
  ADD COLUMN IF NOT EXISTS requester_id TEXT;

-- Backfill from existing columns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'resource_requests'
      AND column_name = 'student_id'
  ) THEN
    EXECUTE 'UPDATE resource_requests SET requester_id = COALESCE(requester_id, user_id, student_id) WHERE requester_id IS NULL';
  ELSE
    EXECUTE 'UPDATE resource_requests SET requester_id = COALESCE(requester_id, user_id) WHERE requester_id IS NULL';
  END IF;
END $$;

-- Ensure not null
ALTER TABLE resource_requests
  ALTER COLUMN requester_id SET NOT NULL;

-- Remove legacy student_id column
ALTER TABLE resource_requests
  DROP COLUMN IF EXISTS student_id;

COMMIT;
