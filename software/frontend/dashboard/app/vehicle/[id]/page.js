"use client";

import { useParams } from "next/navigation";
import { useDashboard } from "../../../components/useDashboard";
import VehicleMap from "../../../components/VehicleMap";
import VehicleSelector from "../../../components/VehicleSelector";
import PaginatedPanel from "../../../components/PaginatedPanel";

export default function VehicleDetailPage() {
  const params = useParams();
  const vehicleId = params.id;
  const { dashboard, connected, activeTrips, latestGpsByVehicle } = useDashboard();

  const activeVehicleIds = activeTrips.map((t) => t.vehicleId);
  const allVehicleIds = [...new Set([...activeVehicleIds, ...Object.keys(latestGpsByVehicle)])];

  const trip = activeTrips.find((t) => t.vehicleId === vehicleId);
  const gps = latestGpsByVehicle[vehicleId];
  const vehiclePassengers = dashboard.passengers.filter((p) => p.vehicleId === vehicleId);
  const vehicleAlerts = dashboard.sosAlerts.filter((a) => a.vehicleId === vehicleId);
  const vehicleGpsLogs = dashboard.gpsLogs.filter((g) => g.vehicleId === vehicleId);
  const isActive = !!trip;

  return (
    <div className="px-6 pb-10 pt-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="animate-fade-in-up">
          <div className="mb-1 flex items-center gap-2.5">
            <span className="h-1 w-8 rounded-full bg-brand-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-500">
              Smart Vehicle SOS
            </span>
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary md:text-3xl">
              {vehicleId}
            </h1>
            {isActive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-600">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse-dot" />
                Active
              </span>
            )}
          </div>
          <div className="mt-2">
            <VehicleSelector vehicles={allVehicleIds} currentVehicleId={vehicleId} />
          </div>
        </div>
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
      </header>

      <div className="mb-6 grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="min-h-[500px]">
          <h2 className="mb-3 text-base font-bold text-text-primary">Live tracking</h2>
          <VehicleMap
            vehicleId={vehicleId}
            lat={gps?.lat}
            lng={gps?.lng}
            timestamp={gps?.timestamp}
            connected={connected}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text-primary">
              <ActivityIcon />
              Vehicle metrics
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-brand-50 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  Passengers
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">
                  {vehiclePassengers.length}
                </p>
              </div>
              <div className="rounded-lg bg-brand-50 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
                  GPS updates
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">
                  {vehicleGpsLogs.length}
                </p>
              </div>
              <div className={`rounded-lg p-4 text-center ${
                vehicleAlerts.length > 0 ? "bg-danger-100" : "bg-brand-50"
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${
                  vehicleAlerts.length > 0 ? "text-danger-600" : "text-brand-600"
                }`}>
                  SOS alerts
                </p>
                <p className={`mt-1 text-2xl font-bold tabular-nums ${
                  vehicleAlerts.length > 0 ? "text-danger-600" : "text-brand-700"
                }`}>
                  {vehicleAlerts.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-surface-card p-6 shadow-sm ring-1 ring-border-default">
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-text-primary">
              <InfoIcon />
              Vehicle info
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Vehicle ID</p>
                <p className="mt-0.5 font-medium text-text-primary">{vehicleId}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Status</p>
                <p className="mt-0.5 font-medium text-text-primary">
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-brand-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                      Active
                    </span>
                  ) : (
                    "Inactive"
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Trip ID</p>
                <p className="mt-0.5 font-mono text-xs font-medium text-text-primary">
                  {trip?.id ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Coordinates
                </p>
                <p className="mt-0.5 font-mono text-xs font-medium text-text-primary">
                  {gps
                    ? `${Number(gps.lat).toFixed(4)}, ${Number(gps.lng).toFixed(4)}`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Last update
                </p>
                <p className="mt-0.5 font-medium text-text-primary">
                  {gps?.timestamp
                    ? new Date(gps.timestamp).toLocaleString()
                    : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-2">
        <PaginatedPanel title={`Passengers on ${vehicleId}`} icon={<PersonIcon />} items={vehiclePassengers} pageSize={5}
          renderItem={(passenger) => {
            const isLinked = !!passenger.tripId;
            return (
              <article key={passenger.id} className="group flex items-center justify-between gap-4 rounded-lg border border-border-default p-4 transition-all duration-150 hover:border-brand-200 hover:bg-brand-50/30">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><PersonIcon /></span>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">{passenger.name}</h3>
                    <p className="text-xs text-text-secondary">Seat {passenger.seat}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${isLinked ? "bg-brand-50 text-brand-600" : "bg-surface-muted text-text-secondary"}`}>
                  {isLinked ? "Linked" : "Boarded"}
                </span>
              </article>
            );
          }}
          emptyState={<EmptyState icon={<PersonIcon />} text={`No passengers on ${vehicleId}.`} hint="Passengers will appear here once they board." />}
        />
        <PaginatedPanel title={`SOS alerts for ${vehicleId}`} icon={<SosIcon />} items={vehicleAlerts} pageSize={5}
          renderItem={(alert) => (
            <article key={alert.id} className="group relative overflow-hidden rounded-lg border border-danger-200 bg-surface-sos p-4 transition-all duration-150 hover:border-danger-300 hover:shadow-sm">
              <span className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-danger-500" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-100 text-danger-600"><SosIcon /></span>
                  <div><h3 className="text-sm font-bold text-danger-700">{alert.vehicleId}</h3></div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-danger-600 animate-pulse-sos">SOS</span>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-text-secondary">
                <p>Coordinates: <span className="font-mono text-text-primary">{alert.coordinates.lat ?? "unknown"}, {alert.coordinates.lng ?? "unknown"}</span></p>
                <time dateTime={alert.triggeredAt}>{new Date(alert.triggeredAt).toLocaleString()}</time>
              </div>
            </article>
          )}
          emptyState={<EmptyState icon={<SosIcon />} text={`No SOS alerts for ${vehicleId}.`} hint="All clear." />}
        />
      </section>
    </div>
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

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
