# Database Schema

The backend uses PostgreSQL locally and can later use hosted PostgreSQL on Supabase.

Local database URL:

```env
DATABASE_URL=postgresql://smart_vehicle_sos:smart_vehicle_sos_password@localhost:5432/smart_vehicle_sos
```

Create the local PostgreSQL role and database:

```bash
sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'smart_vehicle_sos') THEN CREATE ROLE smart_vehicle_sos LOGIN PASSWORD 'smart_vehicle_sos_password'; END IF; END \$\$;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'smart_vehicle_sos'" | grep -q 1 || sudo -u postgres createdb -O smart_vehicle_sos smart_vehicle_sos
```

Apply the schema:

```bash
cd software/backend
npm run db:migrate
```

Relational tables:

## passengers

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `name` | Passenger full name. |
| `seat` | Seat number or label. |
| `vehicle_id` | Vehicle the passenger boarded. |
| `trip_id` | Trip assigned when the operator starts the vehicle trip. |
| `boarded_at` | Timestamp when the passenger registered. |

## contacts

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `phone_number` | Emergency contact phone number. |
| `passenger_id` | Passenger this contact belongs to. |

## trips

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `vehicle_id` | Vehicle assigned to this trip. |
| `status` | Trip state, such as `active` or `completed`. |
| `start_time` | Timestamp when the operator started the trip. |
| `origin` | Departure state selected when starting the trip. |
| `destination` | Arrival state selected when starting the trip. |
| `completed_at` | Timestamp when the trip is completed. |

## gps_logs

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `vehicle_id` | Vehicle reporting the GPS coordinate. |
| `lat` | Latitude. |
| `lng` | Longitude. |
| `timestamp` | Time the coordinate was received. |

## sos_alerts

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `trip_id` | Trip active when SOS was triggered. |
| `vehicle_id` | Vehicle that triggered SOS. |
| `triggered_at` | Time the SOS event was received. |
| `coordinates` | Last known or submitted GPS coordinates. |
| `message` | SOS message sent with the alert. |
