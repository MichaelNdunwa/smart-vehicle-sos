# Database Schema

Planned relational tables for the production backend:

## passengers

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `name` | Passenger full name. |
| `seat` | Seat number or label. |
| `vehicleId` | Vehicle the passenger boarded. |
| `tripId` | Trip assigned when the operator starts the vehicle trip. |

## contacts

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `phoneNumber` | Emergency contact phone number. |
| `passengerId` | Passenger this contact belongs to. |

## trips

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `vehicleId` | Vehicle assigned to this trip. |
| `status` | Trip state, such as `active` or `completed`. |
| `startTime` | Timestamp when the operator started the trip. |

## gps_logs

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `vehicleId` | Vehicle reporting the GPS coordinate. |
| `lat` | Latitude. |
| `lng` | Longitude. |
| `timestamp` | Time the coordinate was received. |

## sos_alerts

| Column | Purpose |
| --- | --- |
| `id` | Primary key. |
| `tripId` | Trip active when SOS was triggered. |
| `vehicleId` | Vehicle that triggered SOS. |
| `triggeredAt` | Time the SOS event was received. |
| `coordinates` | Last known or submitted GPS coordinates. |
