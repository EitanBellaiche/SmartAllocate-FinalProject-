BEGIN;

-- users
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  role TEXT,
  national_id TEXT,
  department TEXT,
  organization_id TEXT,
  password TEXT
);

-- resource_types
CREATE TABLE IF NOT EXISTS resource_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB,
  roles JSONB,
  organization_id TEXT
);

-- resources
CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type_id INTEGER NOT NULL REFERENCES resource_types(id),
  metadata JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  organization_id TEXT
);

-- bookings
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- booking_resources
CREATE TABLE IF NOT EXISTS booking_resources (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  role TEXT
);

-- availability
CREATE TABLE IF NOT EXISTS availability (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  start_date DATE,
  end_date DATE,
  organization_id TEXT
);

-- rules
CREATE TABLE IF NOT EXISTS rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_type TEXT NOT NULL,
  is_hard BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  weight INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  action JSONB NOT NULL DEFAULT '{}'::jsonb,
  organization_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- booking_cancellations
CREATE TABLE IF NOT EXISTS booking_cancellations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  cancelled_reason TEXT,
  cancelled_by TEXT,
  cancelled_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- booking_locations
CREATE TABLE IF NOT EXISTS booking_locations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  location TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- announcements
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  resource_name TEXT,
  sender_name TEXT,
  target_user_id TEXT,
  organization_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- resource_requests
CREATE TABLE IF NOT EXISTS resource_requests (
  id SERIAL PRIMARY KEY,
  resource_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
  requester_id TEXT NOT NULL,
  user_id TEXT,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_date DATE,
  start_time TIME,
  end_time TIME,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  organization_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- user_availability
CREATE TABLE IF NOT EXISTS user_availability (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  start_date DATE,
  end_date DATE,
  organization_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
