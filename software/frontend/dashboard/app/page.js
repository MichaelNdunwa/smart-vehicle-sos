"use client";

import { useState } from "react";
import { useDashboard } from "../components/useDashboard";
import OverviewMap from "../components/OverviewMap";
import PaginatedPanel from "../components/PaginatedPanel";
import NIGERIAN_STATES from "../data/nigerianStates";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function OverviewPage() {
  const { dashboard, connected, activeTrips, latestGpsByVehicle } = useDashboard();
  const [vehicleId, setVehicleId] = useState("VH-001");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startStatus, setStartStatus] = useState("idle");
  const [tripError, setTripError] = useState("");

  async function startTrip(event) {
    event.preventDefault();
    setTripError("");

    if (!origin || !destination) {
      setTripError("Please select both origin and destination.");
      return;
    }

    if (origin === destination) {
      setTripError("Origin and destination cannot be the same.");
      return;
    }

    setStartStatus("starting");

    const response = await fetch(`${API_URL}/api/trip/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, origin, destination })
    });

    if (response.ok) {
      setStartStatus("started");
      setOrigin("");
      setDestination("");
    } else {
      setStartStatus("failed");
    }
  }

  return (
    <div className="px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <header className="mb-6 flex items-center justify-between gap-5 max-sm:grid max-sm:items-start">
          <div className="animate-fade-in-up">
            <div className="mb-1 flex items-center gap-2.5">
              <span className="h-1 w-8 rounded-full bg-brand-500" />
              <span className="text-xs font-semibold uppercase tracking-widest text-brand-500">Smart Vehicle SOS</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">Dashboard</h1>
            <p className="mt-1 text-sm text-text-secondary max-sm:hidden">Monitor all vehicles, passengers, and alerts in real-time.</p>
          </div>
        <StatusBadge connected={connected} />
      </header>

      <section className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <MetricCard label="Passengers boarded" value={dashboard.passengers.length} icon={<PersonIcon />} />
        <MetricCard label="Active trips" value={activeTrips.length} icon={<TripIcon />} />
        <MetricCard label="GPS updates" value={dashboard.gpsLogs.length} icon={<GpsIcon />} />
        <MetricCard label="SOS alerts" value={dashboard.sosAlerts.length} danger icon={<SosIcon />} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-5">
          <section className="min-h-[500px]">
            <h2 className="mb-3 text-base font-bold text-text-primary">Vehicle positions</h2>
            <OverviewMap gpsData={latestGpsByVehicle} connected={connected} />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <PaginatedPanel title="Active vehicles" icon={<VehicleIcon />} items={activeTrips} pageSize={5}
              renderItem={(trip) => <ActiveVehicleCard key={trip.id} trip={trip} gps={latestGpsByVehicle[trip.vehicleId]} />}
              emptyState={<EmptyState icon={<VehicleIcon />} text="No active trips." hint="Start a trip to see vehicle status here." />}
            />
            <PaginatedPanel title="SOS alerts" icon={<SosIcon />} items={dashboard.sosAlerts} pageSize={5}
              renderItem={(alert) => <SosAlertCard key={alert.id} alert={alert} />}
              emptyState={<EmptyState icon={<SosIcon />} text="No SOS alerts triggered." hint="All vehicles are operating normally." />}
            />
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <form
            onSubmit={startTrip}
            className="rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default max-sm:p-4"
          >
            <div className="mb-5">
              <h2 className="text-base font-bold text-text-primary">Start trip</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                Assign boarded passengers to an active trip for a vehicle.
              </p>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-3">
                <label className="grid gap-1.5 text-sm font-semibold text-text-primary">
                  Origin
                  <select
                    className="rounded-lg border border-border-default bg-surface-card px-4 py-2.5 text-sm font-normal text-text-primary outline-none ring-brand-200 transition-all duration-150 focus:border-brand-500 focus:ring-2"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                  >
                    <option value="">-- Select origin --</option>
                    {NIGERIAN_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    const temp = origin;
                    setOrigin(destination);
                    setDestination(temp);
                  }}
                  className="mx-auto -my-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-default bg-surface-card text-text-muted transition-all duration-150 hover:border-brand-300 hover:text-brand-500"
                  title="Swap origin and destination"
                >
                  <SwapIcon />
                </button>

                <label className="grid gap-1.5 text-sm font-semibold text-text-primary">
                  Destination
                  <select
                    className="rounded-lg border border-border-default bg-surface-card px-4 py-2.5 text-sm font-normal text-text-primary outline-none ring-brand-200 transition-all duration-150 focus:border-brand-500 focus:ring-2"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="">-- Select destination --</option>
                    {NIGERIAN_STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-text-primary">
                Vehicle ID
                <input
                  className="rounded-lg border border-border-default px-4 py-2.5 text-sm font-normal text-text-primary outline-none ring-brand-200 transition-all duration-150 placeholder:text-text-muted focus:border-brand-500 focus:ring-2"
                  onChange={(event) => setVehicleId(event.target.value)}
                  value={vehicleId}
                  placeholder="e.g. VH-001"
                />
              </label>

              {tripError && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-danger-600">
                  <XIcon /> {tripError}
                </p>
              )}

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

          <div className="flex-1">
            <PaginatedPanel title="Boarded passengers" icon={<PersonIcon />} items={dashboard.passengers} pageSize={5}
              renderItem={(passenger) => <PassengerCard key={passenger.id} passenger={passenger} />}
              emptyState={<EmptyState icon={<PersonIcon />} text="No passengers registered." hint="Passengers will appear here once they board a vehicle." />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ connected }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider ${
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
      className={`group relative overflow-hidden rounded-xl bg-surface-card p-5 shadow-sm ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
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

function ActiveVehicleCard({ trip, gps }) {
  return (
    <article className="group rounded-lg border border-border-default p-4 transition-all duration-150 hover:border-brand-200 hover:bg-brand-50/30 hover:shadow-sm">
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
      <div className="mt-3 grid gap-1 text-xs text-text-secondary">
        {trip.origin && trip.destination && (
          <p className="truncate">
            {trip.origin} &rarr; {trip.destination}
          </p>
        )}
        <span className={`inline-flex items-center gap-1 ${gps ? "text-brand-600" : "text-text-muted"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${gps ? "bg-brand-500" : "bg-text-muted"}`} />
          GPS: {gps ? `${gps.lat}, ${gps.lng}` : "Waiting for update"}
        </span>
      </div>
    </article>
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
          isLinked ? "bg-brand-50 text-brand-600" : "bg-surface-muted text-text-secondary"
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
    <section className="rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default">
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

function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
