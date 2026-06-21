import "dotenv/config";
import pg from "pg";

const { Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Add it to software/backend/.env");
}

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

await client.connect();

try {
  await client.query("BEGIN");

  // ── Trips ──────────────────────────────────────────────────────────────────
  const trips = await client.query(`
    INSERT INTO trips (vehicle_id, status, start_time, origin, destination)
    VALUES
      ('VH-001', 'active',   now() - interval '2 hours',  'Lagos',           'FCT (Abuja)'),
      ('VH-002', 'active',   now() - interval '1 hour',   'Rivers',          'Enugu'),
      ('VH-003', 'completed',now() - interval '1 day',    'FCT (Abuja)',     'Kano'),
      ('VH-004', 'active',   now() - interval '30 minutes','Oyo',             'Lagos')
    RETURNING id, vehicle_id
  `);

  const tripMap = Object.fromEntries(trips.rows.map((t) => [t.vehicle_id, t.id]));

  // ── Passengers ─────────────────────────────────────────────────────────────
  const passengers = await client.query(`
    INSERT INTO passengers (name, seat, vehicle_id, trip_id, boarded_at)
    VALUES
      ('Chidi Okonkwo',  '1', 'VH-001', $1, now() - interval '2 hours'),
      ('Amina Bello',    '2', 'VH-001', $1, now() - interval '1 hour'),
      ('Emeka Okafor',   '3', 'VH-001', $1, now() - interval '45 minutes'),
      ('Ngozi Eze',      '1', 'VH-002', $2, now() - interval '1 hour'),
      ('Femi Adeyemi',   '2', 'VH-002', $2, now() - interval '50 minutes'),
      ('Zainab Abdullah','3', 'VH-002', $2, now() - interval '30 minutes'),
      ('Kunle Williams', '1', 'VH-004', $3, now() - interval '25 minutes')
    RETURNING id, name
  `, [tripMap["VH-001"], tripMap["VH-002"], tripMap["VH-004"]]);

  const passengerIds = passengers.rows.map((p) => p.id);

  // ── Contacts ───────────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO contacts (phone_number, passenger_id)
    VALUES
      ('+2348012345678', $1),
      ('+2348123456789', $1),
      ('+2348023456789', $2),
      ('+2348234567890', $2),
      ('+2348034567890', $3),
      ('+2348345678901', $3),
      ('+2348045678901', $4),
      ('+2348456789012', $4),
      ('+2348056789012', $5),
      ('+2348567890123', $5),
      ('+2348067890123', $6),
      ('+2348678901234', $6),
      ('+2348078901234', $7),
      ('+2348789012345', $7)
  `, passengerIds);

  // ── GPS Logs ───────────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO gps_logs (vehicle_id, lat, lng, timestamp)
    VALUES
      -- VH-001  Lagos → Abuja  (moving north-east)
      ('VH-001', 6.52, 3.38, now() - interval '10 minutes'),
      ('VH-001', 7.20, 4.50, now() - interval '8 minutes'),
      ('VH-001', 7.90, 5.60, now() - interval '6 minutes'),
      ('VH-001', 8.50, 6.70, now() - interval '4 minutes'),
      ('VH-001', 9.08, 7.40, now() - interval '2 minutes'),

      -- VH-002  Port Harcourt → Enugu  (moving north)
      ('VH-002', 4.82, 7.05, now() - interval '10 minutes'),
      ('VH-002', 5.20, 7.20, now() - interval '8 minutes'),
      ('VH-002', 5.70, 7.30, now() - interval '6 minutes'),
      ('VH-002', 6.20, 7.40, now() - interval '4 minutes'),
      ('VH-002', 6.45, 7.50, now() - interval '2 minutes'),

      -- VH-004  Ibadan → Lagos  (moving south)
      ('VH-004', 7.38, 3.95, now() - interval '8 minutes'),
      ('VH-004', 7.10, 3.80, now() - interval '6 minutes'),
      ('VH-004', 6.70, 3.50, now() - interval '4 minutes'),
      ('VH-004', 6.45, 3.38, now() - interval '2 minutes')
  `);

  // ── SOS Alerts ─────────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO sos_alerts (trip_id, vehicle_id, coordinates, message, triggered_at)
    VALUES
      ($1, 'VH-003', '{"lat": 9.06, "lng": 7.49}', 'SOS! Bus VH-003 in danger.', now() - interval '23 hours'),
      ($2, 'VH-001', '{"lat": 7.20, "lng": 4.50}', 'SOS! Bus VH-001 in danger.', now() - interval '1 hour')
  `, [tripMap["VH-003"], tripMap["VH-001"]]);

  // ── Hardware Logs ──────────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO hardware_logs (vehicle_id, level, message, created_at)
    VALUES
      ('VH-001', 'INFO',  'System boot complete. Firmware v2.1.0',                       now() - interval '2 hours'),
      ('VH-001', 'INFO',  'GSM registered. Signal: -67 dBm',                             now() - interval '1 hour 55 minutes'),
      ('VH-001', 'INFO',  'GPS fix acquired. 8 satellites',                               now() - interval '1 hour 50 minutes'),
      ('VH-001', 'WARN',  'GPS signal weak. 3 satellites',                                now() - interval '10 minutes'),
      ('VH-001', 'INFO',  'GPS fix reacquired. 7 satellites',                             now() - interval '8 minutes'),
      ('VH-002', 'INFO',  'System boot complete. Firmware v2.1.0',                        now() - interval '1 hour'),
      ('VH-002', 'INFO',  'GSM registered. Signal: -71 dBm',                              now() - interval '55 minutes'),
      ('VH-002', 'INFO',  'GPS fix acquired. 9 satellites',                               now() - interval '50 minutes'),
      ('VH-002', 'ERROR', 'GSM connection dropped. Reconnecting...',                       now() - interval '25 minutes'),
      ('VH-002', 'INFO',  'GSM reconnected. Signal: -65 dBm',                             now() - interval '24 minutes'),
      ('VH-004', 'INFO',  'System boot complete. Firmware v2.1.0',                        now() - interval '30 minutes'),
      ('VH-004', 'INFO',  'GSM registered. Signal: -73 dBm',                              now() - interval '25 minutes'),
      ('VH-004', 'WARN',  'GPS fix acquired. 5 satellites (low)',                         now() - interval '20 minutes'),
      ('VH-004', 'INFO',  'Trip started. Origin: Oyo → Lagos',                            now() - interval '25 minutes')
  `);

  await client.query("COMMIT");

  console.log("Seed data inserted successfully.\n");

  const counts = await client.query(`
    SELECT 'trips' AS tbl, count(*) FROM trips
    UNION ALL SELECT 'passengers', count(*) FROM passengers
    UNION ALL SELECT 'contacts', count(*) FROM contacts
    UNION ALL SELECT 'gps_logs', count(*) FROM gps_logs
    UNION ALL SELECT 'sos_alerts', count(*) FROM sos_alerts
    UNION ALL SELECT 'hardware_logs', count(*) FROM hardware_logs
  `);

  for (const row of counts.rows) {
    console.log(`  ${row.tbl.padEnd(12)} ${row.count}`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Seed failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
