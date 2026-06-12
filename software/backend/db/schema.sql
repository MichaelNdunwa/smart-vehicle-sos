CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  start_time timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS trips_one_active_per_vehicle
  ON trips (vehicle_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  seat text NOT NULL,
  vehicle_id text NOT NULL,
  trip_id uuid REFERENCES trips(id) ON DELETE SET NULL,
  boarded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  passenger_id uuid NOT NULL REFERENCES passengers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gps_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gps_logs_vehicle_timestamp_idx
  ON gps_logs (vehicle_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS sos_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  vehicle_id text NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  coordinates jsonb NOT NULL DEFAULT '{"lat": null, "lng": null}'::jsonb,
  message text NOT NULL
);

CREATE INDEX IF NOT EXISTS sos_alerts_triggered_at_idx
  ON sos_alerts (triggered_at DESC);
