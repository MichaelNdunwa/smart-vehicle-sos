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
    <main className="min-h-screen bg-surface-page">
      <div className="mx-auto max-w-[1120px] px-5 pb-10 pt-6 md:px-8 md:pt-8">
        <Header connected={connected} />

        <section className="mb-7 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
          <MetricCard label="Passengers boarded" value={dashboard.passengers.length} icon={<PersonIcon />} />
          <MetricCard label="Active trips" value={activeTrips.length} icon={<TripIcon />} />
          <MetricCard label="GPS updates" value={dashboard.gpsLogs.length} icon={<GpsIcon />} />
          <MetricCard label="SOS alerts" value={dashboard.sosAlerts.length} danger icon={<SosIcon />} />
        </section>

        <section className="mb-7 grid gap-5 lg:grid-cols-[380px_1fr]">
          <StartTripForm
            vehicleId={vehicleId}
            onVehicleIdChange={setVehicleId}
            onSubmit={startTrip}
            startStatus={startStatus}
          />
          <ActiveVehicles trips={activeTrips} latestGps={latestGpsByVehicle} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <Panel title="Boarded passengers" icon={<PersonIcon />}>
            {dashboard.passengers.length === 0 ? (
              <EmptyState icon={<PersonIcon />} text="No passengers registered." hint="Passengers will appear here once they board a vehicle." />
            ) : (
              <div className="grid gap-2.5">
                {dashboard.passengers.map((passenger) => (
                  <PassengerCard key={passenger.id} passenger={passenger} />
                ))}
              </div>
            )}
          </Panel>
          <Panel title="SOS alerts" icon={<SosIcon />}>
            {dashboard.sosAlerts.length === 0 ? (
              <EmptyState icon={<SosIcon />} text="No SOS alerts triggered." hint="All vehicles are operating normally." />
            ) : (
              <div className="grid gap-2.5">
                {dashboard.sosAlerts.map((alert) => (
                  <SosAlertCard key={alert.id} alert={alert} />
                ))}
              </div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Header({ connected }) {
  return (
    <header className="mb-8 flex items-center justify-between gap-5 max-sm:grid max-sm:items-start">
      <div className="animate-fade-in-up">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="h-1 w-8 rounded-full bg-brand-500" />
          <span className="text-xs font-semibold uppercase tracking-widest text-brand-500">Smart Vehicle SOS</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">Trip operations dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">Monitor vehicles, passengers, and emergency alerts in real-time.</p>
      </div>
      <StatusBadge connected={connected} />
    </header>
  );
}

function StatusBadge({ connected }) {
  return (
    <span
      className={`animate-fade-in-up-delayed inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider ${
        connected
          ? "border-brand-200 bg-brand-50 text-brand-600"
          : "border-border-muted bg-surface-muted text-text-muted"
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? "bg-brand-500 animate-pulse-dot" : "bg-text-muted"
        }`}
      />
      {connected ? "Live" : "Offline"}
    </span>
  );
}

function MetricCard({ label, value, danger = false, icon }) {
  return (
    <article
      className={`animate-fade-in-up group relative overflow-hidden rounded-xl bg-surface-card p-5 shadow-sm ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        danger
          ? "ring-danger-200/50 hover:ring-danger-300/60"
          : "ring-border-default hover:ring-border-muted"
      }`}
    >
      {danger && (
        <span className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-danger-500" />
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
        <span className={`opacity-70 ${danger ? "text-danger-500" : "text-text-muted"}`}>
          {icon}
        </span>
      </div>
      <strong
        className={`mt-2 block text-3xl font-bold tracking-tight tabular-nums md:text-4xl ${
          danger ? "text-danger-600" : "text-text-primary"
        }`}
      >
        {value}
      </strong>
    </article>
  );
}

function StartTripForm({ vehicleId, onVehicleIdChange, onSubmit, startStatus }) {
  return (
    <form
      onSubmit={onSubmit}
      className="animate-fade-in-up-delayed rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default"
    >
      <div className="mb-5">
        <h2 className="text-base font-bold text-text-primary">Start trip</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          Assign boarded passengers to an active trip for a vehicle.
        </p>
      </div>
      <div className="grid gap-4">
        <label className="grid gap-1.5 text-sm font-semibold text-text-primary">
          Vehicle ID
          <input
            className="rounded-lg border border-border-default px-4 py-2.5 text-sm font-normal text-text-primary outline-none ring-brand-200 transition-all duration-150 placeholder:text-text-muted focus:border-brand-500 focus:ring-2"
            onChange={(event) => onVehicleIdChange(event.target.value)}
            value={vehicleId}
            placeholder="e.g. VH-001"
          />
        </label>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-150 hover:bg-brand-600 hover:shadow active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-brand-500"
          disabled={startStatus === "starting"}
          type="submit"
        >
          {startStatus === "starting" ? (
            <>
              <Spinner />
              Starting...
            </>
          ) : (
            "START TRIP"
          )}
        </button>
        {startStatus === "started" && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-600">
            <CheckIcon /> Trip started successfully.
          </p>
        )}
        {startStatus === "failed" && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-danger-600">
            <XIcon /> Could not start trip.
          </p>
        )}
      </div>
    </form>
  );
}

function ActiveVehicles({ trips, latestGps }) {
  return (
    <div className="animate-fade-in-up-delayed rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default">
      <h2 className="mb-4 text-base font-bold text-text-primary">Active vehicles</h2>
      {trips.length === 0 ? (
        <EmptyState
          icon={<VehicleIcon />}
          text="No active trips."
          hint="Start a trip to see vehicle status here."
        />
      ) : (
        <div className="grid gap-3">
          {trips.map((trip) => {
            const gps = latestGps[trip.vehicleId];
            return (
              <article
                key={trip.id}
                className="group rounded-lg border border-border-default p-4 transition-all duration-150 hover:border-brand-200 hover:bg-brand-50/30 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <VehicleIcon />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">{trip.vehicleId}</h3>
                      <p className="text-xs text-text-muted">Trip {trip.id}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-brand-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-dot" />
                    Active
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-text-secondary">
                  <span
                    className={`inline-flex items-center gap-1 ${
                      gps ? "text-brand-600" : "text-text-muted"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        gps ? "bg-brand-500" : "bg-text-muted"
                      }`}
                    />
                    GPS: {gps ? `${gps.lat}, ${gps.lng}` : "Waiting for update"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PassengerCard({ passenger }) {
  const isLinked = !!passenger.tripId;
  return (
    <article className="group flex items-center justify-between gap-4 rounded-lg border border-border-default p-4 transition-all duration-150 hover:border-brand-200 hover:bg-brand-50/30">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <PersonIcon />
        </span>
        <div>
          <h3 className="text-sm font-bold text-text-primary">{passenger.name}</h3>
          <p className="text-xs text-text-secondary">
            Seat {passenger.seat} &middot; {passenger.vehicleId}
          </p>
        </div>
      </div>
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
          isLinked
            ? "bg-brand-50 text-brand-600"
            : "bg-surface-muted text-text-secondary"
        }`}
      >
        {isLinked ? "Linked" : "Boarded"}
      </span>
    </article>
  );
}

function SosAlertCard({ alert }) {
  return (
    <article className="group relative overflow-hidden rounded-lg border border-danger-200 bg-surface-sos p-4 transition-all duration-150 hover:border-danger-300 hover:shadow-sm">
      <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-danger-500" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-100 text-danger-600">
            <SosIcon />
          </span>
          <div>
            <h3 className="text-sm font-bold text-danger-700">{alert.vehicleId}</h3>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-danger-600 animate-pulse-sos">
          SOS
        </span>
      </div>
      <div className="mt-3 grid gap-1 text-xs text-text-secondary">
        <p>
          Coordinates:{" "}
          <span className="font-mono text-text-primary">
            {alert.coordinates.lat ?? "unknown"}, {alert.coordinates.lng ?? "unknown"}
          </span>
        </p>
        <time dateTime={alert.triggeredAt}>
          {new Date(alert.triggeredAt).toLocaleString()}
        </time>
      </div>
    </article>
  );
}

function Panel({ title, icon, children }) {
  return (
    <section className="animate-fade-in-up-delayed rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text-primary">
        <span className="text-text-muted">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({ icon, text, hint }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-lg border border-dashed border-border-muted px-5 py-8 text-center">
      <span className="text-text-muted opacity-50">{icon}</span>
      <p className="text-sm font-medium text-text-secondary">{text}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function TripIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

function GpsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

function SosIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function VehicleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17h14l1-4H4l1 4z" />
      <path d="M5 17v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2" />
      <path d="M15 17v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-2" />
      <path d="M1 13l1-4h20l1 4" />
      <circle cx="6" cy="10" r="1" />
      <circle cx="18" cy="10" r="1" />
      <path d="M18 5H6l-2 4h16l-2-4z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
