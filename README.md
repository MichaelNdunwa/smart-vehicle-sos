# Smart Vehicle SOS

Smart Vehicle SOS is an emergency alert prototype for public or commercial vehicles. Passengers register their seat and emergency contacts before departure, an operator starts a vehicle trip from the dashboard, and an Arduino + SIM808 device keeps the backend updated with trip, GPS, and SOS events.

When the SOS button is held for 10 seconds, the vehicle device sends SMS alerts to the emergency contacts stored for the active trip and also notifies the backend. The business dashboard receives the SOS event in real time over Socket.IO.

## Core Flow

```text
Passenger Website
  POST /api/passenger/register
  { name, seat, contacts[], vehicleId }
        |
        v
Backend
  Saves passenger and contacts
  Links records to vehicleId and active tripId
        |
        v
Business Dashboard
  Operator sees passengers boarded
  Operator clicks START TRIP for Vehicle VH-001
        |
        v
Arduino + SIM808
  Polls GET /api/trip/active?vehicleId=VH-001 every 30s
  Stores contact list in memory
  Posts GPS coordinates to backend
        |
        v
SOS Button Held 10s
  SIM808 sends SMS to contacts
  Arduino posts SOS event to backend
  Backend broadcasts alert to dashboard
```

## Features

- Passenger registration with name, seat, vehicle ID, and emergency contacts.
- Operator dashboard for boarded passengers, active trips, GPS updates, and SOS alerts.
- Trip start workflow that links waiting passengers to a vehicle trip.
- Arduino/SIM808 scaffold for active-trip polling, GPS update posting, SMS alerting, and SOS triggering.
- Socket.IO updates from backend to dashboard.
- In-memory backend tables named after the intended production schema.

## Tech Stack

- Hardware: Arduino + SIM808 GSM/GPRS/GPS module
- Backend: Node.js, Express, Socket.IO
- Passenger frontend: Next.js, React, Tailwind CSS
- Dashboard frontend: Next.js, React, Tailwind CSS, Socket.IO client
- Planned database tables: `passengers`, `contacts`, `trips`, `gps_logs`, `sos_alerts`

## Project Structure

```text
smart-vehicle-sos/
├── hardware/
│   ├── README.md
│   └── arduino/
│       └── smart_vehicle_sos/       # Arduino sketches
├── software/
│   ├── backend/                     # Node.js + Express + Socket.IO
│   └── frontend/
│       ├── passenger/               # Next.js passenger registration form
│       └── dashboard/               # Next.js business dashboard
├── docs/
│   ├── architecture.md
│   ├── database.md
│   └── wiring.md
├── LICENSE
└── README.md
```

## Getting Started

Run the backend and both frontend apps in separate terminals.

### Backend

```bash
cd software/backend
npm install
cp .env.example .env
npm run dev
```

Backend default URL: `http://localhost:4000`

### Passenger Website

```bash
cd software/frontend/passenger
npm install
npm run dev
```

Passenger website default URL: `http://localhost:3000`

### Business Dashboard

```bash
cd software/frontend/dashboard
npm install
npm run dev
```

Dashboard default URL: `http://localhost:3001`

## Environment

Backend environment variables are defined in [software/backend/.env.example](software/backend/.env.example).

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

Both frontend apps default to `http://localhost:4000` for the backend. Set `NEXT_PUBLIC_API_URL` if the API runs elsewhere.

## API Reference

| Method | Endpoint | Used By | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Ops/dev | Check backend health. |
| `GET` | `/api/dashboard` | Dashboard | Fetch passengers, contacts, trips, GPS logs, and SOS alerts. |
| `POST` | `/api/passenger/register` | Passenger site | Save passenger and emergency contacts. |
| `POST` | `/api/trip/start` | Dashboard | Start an active trip for a vehicle. |
| `GET` | `/api/trip/active?vehicleId=VH-001` | Arduino | Return active trip ID and contact list. |
| `POST` | `/api/gps/update` | Arduino | Save latest vehicle GPS coordinates. |
| `POST` | `/api/sos/trigger` | Arduino | Save and broadcast an SOS event. |

### Register Passenger

```bash
curl -X POST http://localhost:4000/api/passenger/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Passenger","seat":"A12","vehicleId":"VH-001","contacts":["+2348012345678","+2348098765432"]}'
```

### Start Trip

```bash
curl -X POST http://localhost:4000/api/trip/start \
  -H "Content-Type: application/json" \
  -d '{"vehicleId":"VH-001"}'
```

### Poll Active Trip

```bash
curl "http://localhost:4000/api/trip/active?vehicleId=VH-001"
```

Example response:

```json
{
  "tripId": "trip-id",
  "vehicleId": "VH-001",
  "contacts": [
    {
      "phoneNumber": "+2348012345678",
      "passengerId": "passenger-id"
    }
  ]
}
```

### Post GPS Update

```bash
curl -X POST http://localhost:4000/api/gps/update \
  -H "Content-Type: application/json" \
  -d '{"vehicleId":"VH-001","lat":6.5244,"lng":3.3792}'
```

### Trigger SOS

```bash
curl -X POST http://localhost:4000/api/sos/trigger \
  -H "Content-Type: application/json" \
  -d '{"vehicleId":"VH-001","lat":6.5244,"lng":3.3792}'
```

## Hardware Behavior

The Arduino scaffold is in [hardware/arduino/smart_vehicle_sos/smart_vehicle_sos.ino](hardware/arduino/smart_vehicle_sos/smart_vehicle_sos.ino).

Expected behavior:

- Poll the backend every 30 seconds for the active trip and contact list.
- Store contacts in memory for the current trip.
- Send GPS coordinates to the backend during the trip.
- Detect an SOS button hold of 10 seconds.
- Send an SMS through SIM808 to all stored contacts.
- Post the SOS event to the backend for dashboard visibility.

## Documentation

- [Architecture](docs/architecture.md)
- [Database schema](docs/database.md)
- [Wiring diagram](docs/wiring.md)

## Screenshots

Screenshots can be added as the UI stabilizes.

| Passenger Website | Business Dashboard |
| --- | --- |
| `docs/screenshots/passenger.png` | `docs/screenshots/dashboard.png` |

## Licensing

The software code in this repository is licensed under the MIT License.

The hardware design files, including schematics and PCB layouts in the `/hardware` folder, are licensed under CERN-OHL-W-2.0.
