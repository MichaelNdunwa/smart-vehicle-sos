"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const initialState = {
  passengers: [],
  contacts: [],
  trips: [],
  gpsLogs: [],
  sosAlerts: []
};

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(initialState);
  const [connected, setConnected] = useState(false);
  const [vehicleId, setVehicleId] = useState("VH-001");
  const [startStatus, setStartStatus] = useState("idle");

  useEffect(() => {
    fetch(`${API_URL}/api/dashboard`)
      .then((response) => response.json())
      .then((data) => setDashboard({ ...initialState, ...data }))
      .catch(() => setDashboard(initialState));

    const socket = io(API_URL);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("dashboard:sync", (state) => setDashboard({ ...initialState, ...state }));

    return () => socket.disconnect();
  }, []);

  const activeTrips = dashboard.trips.filter((trip) => trip.status === "active");
  const latestGpsByVehicle = useMemo(() => {
    return dashboard.gpsLogs.reduce((latest, gpsLog) => {
      latest[gpsLog.vehicleId] = gpsLog;
      return latest;
    }, {});
  }, [dashboard.gpsLogs]);

  async function startTrip(event) {
    event.preventDefault();
    setStartStatus("starting");

    const response = await fetch(`${API_URL}/api/trip/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId })
    });

    setStartStatus(response.ok ? "started" : "failed");
  }

  return (
    <main className="min-h-screen bg-[#f7f8fa] p-5 text-[#1c2328] md:p-7">
      <header className="mx-auto mb-6 flex max-w-[1100px] items-center justify-between gap-5 max-sm:grid max-sm:items-start">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase text-[#3d715c]">Smart Vehicle SOS</p>
          <h1 className="text-3xl font-bold">Trip operations dashboard</h1>
        </div>
        <span
          className={`rounded-full border px-3 py-2 font-bold ${
            connected ? "border-[#7ac59e] text-[#206841]" : "border-[#cbd2d8] text-[#6b747c]"
          }`}
        >
          {connected ? "Live" : "Offline"}
        </span>
      </header>

      <section className="mx-auto mb-6 grid max-w-[1100px] grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <Metric label="Passengers boarded" value={dashboard.passengers.length} />
        <Metric label="Active trips" value={activeTrips.length} />
        <Metric label="GPS updates" value={dashboard.gpsLogs.length} />
        <Metric label="SOS alerts" value={dashboard.sosAlerts.length} danger />
      </section>

      <section className="mx-auto mb-6 grid max-w-[1100px] gap-4 lg:grid-cols-[360px_1fr]">
        <form className="grid gap-4 rounded-lg border border-[#dfe4e8] bg-white p-5" onSubmit={startTrip}>
          <div>
            <h2 className="text-lg font-bold">Start trip</h2>
            <p className="mt-1 text-sm leading-6 text-[#5f6a72]">Assign boarded passengers to an active trip for a vehicle.</p>
          </div>
          <label className="grid gap-2 font-semibold text-[#324039]">
            Vehicle ID
            <input
              className="rounded-md border border-[#cbd2d8] px-3.5 py-3 font-normal outline-none transition focus:border-[#3d715c] focus:ring-2 focus:ring-[#3d715c]/15"
              onChange={(event) => setVehicleId(event.target.value)}
              value={vehicleId}
            />
          </label>
          <button
            className="rounded-md bg-[#1f6f50] px-4 py-3 font-bold text-white transition hover:bg-[#18553d] disabled:cursor-wait disabled:opacity-70"
            disabled={startStatus === "starting"}
            type="submit"
          >
            {startStatus === "starting" ? "Starting..." : "START TRIP"}
          </button>
          {startStatus === "started" && <p className="text-sm font-semibold text-[#21784a]">Trip started.</p>}
          {startStatus === "failed" && <p className="text-sm font-semibold text-[#a31328]">Could not start trip.</p>}
        </form>

        <div className="grid gap-3 rounded-lg border border-[#dfe4e8] bg-white p-5">
          <h2 className="text-lg font-bold">Active vehicles</h2>
          {activeTrips.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#cbd2d8] p-5 text-center text-[#65717a]">No active trips.</p>
          ) : (
            activeTrips.map((trip) => {
              const latestGps = latestGpsByVehicle[trip.vehicleId];
              return (
                <article className="grid gap-2 rounded-lg border border-[#e4e8eb] p-4" key={trip.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{trip.vehicleId}</h3>
                      <p className="text-sm text-[#5f6a72]">Trip {trip.id}</p>
                    </div>
                    <span className="rounded-full bg-[#e9f7ef] px-2.5 py-1.5 text-xs font-extrabold uppercase text-[#206841]">
                      Active
                    </span>
                  </div>
                  <p className="text-sm text-[#5f6a72]">
                    Latest GPS: {latestGps ? `${latestGps.lat}, ${latestGps.lng}` : "Waiting for Arduino update"}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1100px] gap-4 lg:grid-cols-2">
        <Panel title="Boarded passengers">
          {dashboard.passengers.length === 0 ? (
            <EmptyState text="No passengers registered." />
          ) : (
            dashboard.passengers.map((passenger) => (
              <article className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-[#e4e8eb] p-4" key={passenger.id}>
                <div>
                  <h3 className="font-bold">{passenger.name}</h3>
                  <p className="text-sm text-[#5f6a72]">Seat {passenger.seat} on {passenger.vehicleId}</p>
                </div>
                <span className="text-sm font-bold text-[#5f6a72]">{passenger.tripId ? "Linked" : "Boarded"}</span>
              </article>
            ))
          )}
        </Panel>

        <Panel title="SOS alerts">
          {dashboard.sosAlerts.length === 0 ? (
            <EmptyState text="No SOS alerts triggered." />
          ) : (
            dashboard.sosAlerts.map((alert) => (
              <article className="grid gap-2 rounded-lg border border-[#f2c6ce] bg-[#fff7f8] p-4" key={alert.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-[#a31328]">{alert.vehicleId}</h3>
                  <span className="rounded-full bg-[#ffe8ec] px-2.5 py-1.5 text-xs font-extrabold uppercase text-[#a31328]">
                    SOS
                  </span>
                </div>
                <p className="text-sm text-[#5f6a72]">
                  Coordinates: {alert.coordinates.lat ?? "unknown"}, {alert.coordinates.lng ?? "unknown"}
                </p>
                <time className="text-sm text-[#5f6a72]" dateTime={alert.triggeredAt}>
                  {new Date(alert.triggeredAt).toLocaleString()}
                </time>
              </article>
            ))
          )}
        </Panel>
      </section>
    </main>
  );
}

function Metric({ label, value, danger = false }) {
  return (
    <article className="grid gap-2 rounded-lg border border-[#dfe4e8] bg-white p-5">
      <span className="font-bold text-[#5f6a72]">{label}</span>
      <strong className={`text-4xl ${danger ? "text-[#a31328]" : "text-[#1c2328]"}`}>{value}</strong>
    </article>
  );
}

function Panel({ title, children }) {
  return (
    <section className="grid content-start gap-3 rounded-lg border border-[#dfe4e8] bg-white p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return <p className="rounded-lg border border-dashed border-[#cbd2d8] p-5 text-center text-[#65717a]">{text}</p>;
}
