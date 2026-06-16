import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { pool, query, withTransaction } from "./db.js";

const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 4000;
const corsOrigin = process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:3000", "http://localhost:3001"];

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const passengerFields = `
  id::text,
  name,
  seat,
  vehicle_id AS "vehicleId",
  trip_id::text AS "tripId",
  boarded_at AS "boardedAt"
`;

const contactFields = `
  id::text,
  phone_number AS "phoneNumber",
  passenger_id::text AS "passengerId"
`;

const tripFields = `
  id::text,
  vehicle_id AS "vehicleId",
  status,
  start_time AS "startTime"
`;

const gpsLogFields = `
  id::text,
  vehicle_id AS "vehicleId",
  lat,
  lng,
  timestamp
`;

const sosAlertFields = `
  id::text,
  trip_id::text AS "tripId",
  vehicle_id AS "vehicleId",
  triggered_at AS "triggeredAt",
  coordinates,
  message
`;

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

async function activeTripFor(vehicleId, client = { query }) {
  const result = await client.query(
    `
      SELECT ${tripFields}
      FROM trips
      WHERE vehicle_id = $1 AND status = 'active'
      LIMIT 1
    `,
    [vehicleId]
  );

  return result.rows[0] ?? null;
}

async function contactsForTrip(tripId, client = { query }) {
  const result = await client.query(
    `
      SELECT
        c.phone_number AS "phoneNumber"
      FROM contacts c
      INNER JOIN passengers p ON p.id = c.passenger_id
      WHERE p.trip_id = $1
      ORDER BY p.boarded_at ASC, c.phone_number ASC
      LIMIT 5
    `,
    [tripId]
  );

  // Return only phoneNumber — passengerId is omitted to keep the payload
  // small enough for the SIM808's constrained response buffer (~300 bytes).
  return result.rows.map((r) => ({ phoneNumber: r.phoneNumber }));
}

async function latestGpsFor(vehicleId, client = { query }) {
  const result = await client.query(
    `
      SELECT ${gpsLogFields}
      FROM gps_logs
      WHERE vehicle_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `,
    [vehicleId]
  );

  return result.rows[0] ?? null;
}

async function dashboardState() {
  const [passengersResult, contactsResult, tripsResult, gpsLogsResult, sosAlertsResult] = await Promise.all([
    query(`SELECT ${passengerFields} FROM passengers ORDER BY boarded_at DESC`),
    query(`SELECT ${contactFields} FROM contacts ORDER BY phone_number ASC`),
    query(`SELECT ${tripFields} FROM trips ORDER BY start_time DESC`),
    query(`SELECT ${gpsLogFields} FROM gps_logs ORDER BY timestamp ASC`),
    query(`SELECT ${sosAlertFields} FROM sos_alerts ORDER BY triggered_at DESC`)
  ]);

  return {
    passengers: passengersResult.rows,
    contacts: contactsResult.rows,
    trips: tripsResult.rows,
    gpsLogs: gpsLogsResult.rows,
    sosAlerts: sosAlertsResult.rows
  };
}

async function emitDashboardSync() {
  io.emit("dashboard:sync", await dashboardState());
}

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "smart-vehicle-sos-backend",
    message: "Backend API is running",
    endpoints: {
      health: "/health",
      dashboard: "/api/dashboard",
      passengers: "/api/passengers"
    }
  });
});

app.get(
  "/health",
  asyncHandler(async (_req, res) => {
    await query("SELECT 1");
    res.json({ status: "ok", service: "smart-vehicle-sos-backend", database: "connected" });
  })
);

app.get(
  "/api/dashboard",
  asyncHandler(async (_req, res) => {
    res.json(await dashboardState());
  })
);

app.get(
  "/api/passengers",
  asyncHandler(async (req, res) => {
    const { vehicleId } = req.query;
    const result = vehicleId
      ? await query(`SELECT ${passengerFields} FROM passengers WHERE vehicle_id = $1 ORDER BY boarded_at DESC`, [vehicleId])
      : await query(`SELECT ${passengerFields} FROM passengers ORDER BY boarded_at DESC`);

    res.json({ passengers: result.rows });
  })
);


app.get(
  "/api/vehicles",
  asyncHandler(async (_req, res) => {
    const result = await query(
      `SELECT DISTINCT vehicle_id AS "vehicleId" FROM trips ORDER BY vehicle_id ASC`
    );
    res.json({ vehicles: result.rows.map((r) => r.vehicleId) });
  })
);

app.post(
  "/api/passenger/register",
  asyncHandler(async (req, res) => {
    const { name, seat, vehicleId } = req.body;
    const phoneNumbers = Array.isArray(req.body.contacts) ? req.body.contacts : [];

    if (!name || !seat || !vehicleId || phoneNumbers.length === 0) {
      return res.status(400).json({
        error: "name, seat, vehicleId, and at least one contact phone number are required"
      });
    }

    const cleanPhoneNumbers = phoneNumbers.map((phoneNumber) => String(phoneNumber).trim()).filter(Boolean);

    if (cleanPhoneNumbers.length === 0) {
      return res.status(400).json({ error: "at least one valid contact phone number is required" });
    }

    const { passenger, contacts } = await withTransaction(async (client) => {
      const activeTrip = await activeTripFor(vehicleId, client);
      const passengerResult = await client.query(
        `
          INSERT INTO passengers (name, seat, vehicle_id, trip_id)
          VALUES ($1, $2, $3, $4)
          RETURNING ${passengerFields}
        `,
        [name, seat, vehicleId, activeTrip?.id ?? null]
      );
      const savedPassenger = passengerResult.rows[0];
      const savedContacts = [];

      for (const phoneNumber of cleanPhoneNumbers) {
        const contactResult = await client.query(
          `
            INSERT INTO contacts (phone_number, passenger_id)
            VALUES ($1, $2)
            RETURNING ${contactFields}
          `,
          [phoneNumber, savedPassenger.id]
        );
        savedContacts.push(contactResult.rows[0]);
      }

      return { passenger: savedPassenger, contacts: savedContacts };
    });

    io.emit("passenger:registered", { passenger, contacts });
    await emitDashboardSync();

    return res.status(201).json({ passenger, contacts });
  })
);

app.post(
  "/api/trip/start",
  asyncHandler(async (req, res) => {
    const { vehicleId } = req.body;

    if (!vehicleId) {
      return res.status(400).json({ error: "vehicleId is required" });
    }

    const trip = await withTransaction(async (client) => {
      const existingTrip = await activeTripFor(vehicleId, client);

      if (existingTrip) {
        return { conflict: true, trip: existingTrip };
      }

      const tripResult = await client.query(
        `
          INSERT INTO trips (vehicle_id, status)
          VALUES ($1, 'active')
          RETURNING ${tripFields}
        `,
        [vehicleId]
      );
      const startedTrip = tripResult.rows[0];

      await client.query(
        `
          UPDATE passengers
          SET trip_id = $1
          WHERE vehicle_id = $2 AND trip_id IS NULL
        `,
        [startedTrip.id, vehicleId]
      );

      return startedTrip;
    });

    if (trip.conflict) {
      return res.status(409).json({ error: "vehicle already has an active trip", trip: trip.trip });
    }

    io.emit("trip:started", trip);
    await emitDashboardSync();

    return res.status(201).json({ trip });
  })
);

app.get(
  "/api/trip/active",
  asyncHandler(async (req, res) => {
    const { vehicleId } = req.query;

    if (!vehicleId) {
      return res.status(400).json({ error: "vehicleId is required" });
    }

    const trip = await activeTripFor(vehicleId);

    if (!trip) {
      return res.status(404).json({ error: "no active trip for vehicle" });
    }

    return res.json({
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      contacts: await contactsForTrip(trip.id)
    });
  })
);

app.post(
  "/api/gps/update",
  asyncHandler(async (req, res) => {
    const { vehicleId, lat, lng } = req.body;

    if (!vehicleId || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: "vehicleId, lat, and lng are required" });
    }

    const gpsLogResult = await query(
      `
        INSERT INTO gps_logs (vehicle_id, lat, lng)
        VALUES ($1, $2, $3)
        RETURNING ${gpsLogFields}
      `,
      [vehicleId, Number(lat), Number(lng)]
    );
    const gpsLog = gpsLogResult.rows[0];

    io.emit("gps:updated", gpsLog);
    await emitDashboardSync();

    return res.status(201).json({ gpsLog });
  })
);

app.post(
  "/api/sos/trigger",
  asyncHandler(async (req, res) => {
    const { vehicleId } = req.body;

    if (!vehicleId) {
      return res.status(400).json({ error: "vehicleId and an active trip are required" });
    }

    const trip = req.body.tripId
      ? (
          await query(
            `
              SELECT ${tripFields}
              FROM trips
              WHERE id = $1
              LIMIT 1
            `,
            [req.body.tripId]
          )
        ).rows[0] ?? null
      : await activeTripFor(vehicleId);
    const latestGps = await latestGpsFor(vehicleId);

    if (!trip) {
      return res.status(400).json({ error: "vehicleId and an active trip are required" });
    }

    const coordinates = {
      lat: req.body.lat ?? req.body.coordinates?.lat ?? latestGps?.lat ?? null,
      lng: req.body.lng ?? req.body.coordinates?.lng ?? latestGps?.lng ?? null
    };

    const sosAlertResult = await query(
      `
        INSERT INTO sos_alerts (trip_id, vehicle_id, coordinates, message)
        VALUES ($1, $2, $3, $4)
        RETURNING ${sosAlertFields}
      `,
      [trip.id, vehicleId, JSON.stringify(coordinates), req.body.message ?? `SOS! Bus ${vehicleId} in danger.`]
    );
    const sosAlert = sosAlertResult.rows[0];

    io.emit("sos:triggered", sosAlert);
    await emitDashboardSync();

    return res.status(201).json({ sosAlert });
  })
);

io.on("connection", async (socket) => {
  try {
    socket.emit("dashboard:sync", await dashboardState());
  } catch (error) {
    socket.emit("dashboard:error", { error: "Could not load dashboard state" });
    console.error(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

server.listen(port, () => {
  console.log(`Smart Vehicle SOS backend listening on http://localhost:${port}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  process.exit(0);
});
