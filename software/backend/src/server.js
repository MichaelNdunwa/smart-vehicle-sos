import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";

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

const passengers = [];
const contacts = [];
const trips = [];
const gpsLogs = [];
const sosAlerts = [];

function activeTripFor(vehicleId) {
  return trips.find((trip) => trip.vehicleId === vehicleId && trip.status === "active") ?? null;
}

function contactsForTrip(tripId) {
  const passengerIds = passengers.filter((passenger) => passenger.tripId === tripId).map((passenger) => passenger.id);

  return contacts
    .filter((contact) => passengerIds.includes(contact.passengerId))
    .map((contact) => ({
      phoneNumber: contact.phoneNumber,
      passengerId: contact.passengerId
    }));
}

function latestGpsFor(vehicleId) {
  for (let index = gpsLogs.length - 1; index >= 0; index--) {
    if (gpsLogs[index].vehicleId === vehicleId) {
      return gpsLogs[index];
    }
  }

  return null;
}

function dashboardState() {
  return {
    passengers,
    contacts,
    trips,
    gpsLogs,
    sosAlerts
  };
}

function emitDashboardSync() {
  io.emit("dashboard:sync", dashboardState());
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "smart-vehicle-sos-backend" });
});

app.get("/api/dashboard", (_req, res) => {
  res.json(dashboardState());
});

app.get("/api/passengers", (req, res) => {
  const { vehicleId } = req.query;
  const filteredPassengers = vehicleId
    ? passengers.filter((passenger) => passenger.vehicleId === vehicleId)
    : passengers;

  res.json({ passengers: filteredPassengers });
});

app.post("/api/passenger/register", (req, res) => {
  const { name, seat, vehicleId } = req.body;
  const phoneNumbers = Array.isArray(req.body.contacts) ? req.body.contacts : [];

  if (!name || !seat || !vehicleId || phoneNumbers.length === 0) {
    return res.status(400).json({
      error: "name, seat, vehicleId, and at least one contact phone number are required"
    });
  }

  const activeTrip = activeTripFor(vehicleId);
  const passenger = {
    id: randomUUID(),
    name,
    seat,
    vehicleId,
    tripId: activeTrip?.id ?? null,
    boardedAt: new Date().toISOString()
  };

  const savedContacts = phoneNumbers
    .map((phoneNumber) => String(phoneNumber).trim())
    .filter(Boolean)
    .map((phoneNumber) => ({
      id: randomUUID(),
      phoneNumber,
      passengerId: passenger.id
    }));

  if (savedContacts.length === 0) {
    return res.status(400).json({ error: "at least one valid contact phone number is required" });
  }

  passengers.push(passenger);
  contacts.push(...savedContacts);

  io.emit("passenger:registered", { passenger, contacts: savedContacts });
  emitDashboardSync();

  return res.status(201).json({ passenger, contacts: savedContacts });
});

app.post("/api/trip/start", (req, res) => {
  const { vehicleId } = req.body;

  if (!vehicleId) {
    return res.status(400).json({ error: "vehicleId is required" });
  }

  const existingTrip = activeTripFor(vehicleId);

  if (existingTrip) {
    return res.status(409).json({ error: "vehicle already has an active trip", trip: existingTrip });
  }

  const trip = {
    id: randomUUID(),
    vehicleId,
    status: "active",
    startTime: new Date().toISOString()
  };

  trips.push(trip);

  passengers
    .filter((passenger) => passenger.vehicleId === vehicleId && passenger.tripId === null)
    .forEach((passenger) => {
      passenger.tripId = trip.id;
    });

  io.emit("trip:started", trip);
  emitDashboardSync();

  return res.status(201).json({ trip });
});

app.get("/api/trip/active", (req, res) => {
  const { vehicleId } = req.query;

  if (!vehicleId) {
    return res.status(400).json({ error: "vehicleId is required" });
  }

  const trip = activeTripFor(vehicleId);

  if (!trip) {
    return res.status(404).json({ error: "no active trip for vehicle" });
  }

  return res.json({
    tripId: trip.id,
    vehicleId: trip.vehicleId,
    contacts: contactsForTrip(trip.id)
  });
});

app.post("/api/gps/update", (req, res) => {
  const { vehicleId, lat, lng } = req.body;

  if (!vehicleId || lat === undefined || lng === undefined) {
    return res.status(400).json({ error: "vehicleId, lat, and lng are required" });
  }

  const gpsLog = {
    id: randomUUID(),
    vehicleId,
    lat: Number(lat),
    lng: Number(lng),
    timestamp: new Date().toISOString()
  };

  gpsLogs.push(gpsLog);
  io.emit("gps:updated", gpsLog);
  emitDashboardSync();

  return res.status(201).json({ gpsLog });
});

app.post("/api/sos/trigger", (req, res) => {
  const { vehicleId } = req.body;
  const trip = req.body.tripId ? trips.find((item) => item.id === req.body.tripId) : activeTripFor(vehicleId);
  const latestGps = latestGpsFor(vehicleId);

  if (!vehicleId || !trip) {
    return res.status(400).json({ error: "vehicleId and an active trip are required" });
  }

  const coordinates = {
    lat: req.body.lat ?? req.body.coordinates?.lat ?? latestGps?.lat ?? null,
    lng: req.body.lng ?? req.body.coordinates?.lng ?? latestGps?.lng ?? null
  };

  const sosAlert = {
    id: randomUUID(),
    tripId: trip.id,
    vehicleId,
    triggeredAt: new Date().toISOString(),
    coordinates,
    message: req.body.message ?? `SOS! Bus ${vehicleId} in danger.`
  };

  sosAlerts.unshift(sosAlert);
  io.emit("sos:triggered", sosAlert);
  emitDashboardSync();

  return res.status(201).json({ sosAlert });
});

io.on("connection", (socket) => {
  socket.emit("dashboard:sync", dashboardState());
});

server.listen(port, () => {
  console.log(`Smart Vehicle SOS backend listening on http://localhost:${port}`);
});
