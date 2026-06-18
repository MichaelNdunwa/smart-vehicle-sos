"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Safety indicator (dashboard-style status light) ──────────

function SafetyIndicator({ status, vehiclesLoading, noVehicles }) {
  const isIdle = status === "idle";
  const isLoading = isIdle && vehiclesLoading;

  let colorClass, animClass, label;

  if (status === "sending") {
    colorClass = "bg-amber";
    animClass = "motion-safe:animate-pulse";
    label = "Recording\u2026";
  } else if (status === "sent") {
    colorClass = "bg-green";
    animClass = "";
    label = "Registered";
  } else if (status === "failed") {
    colorClass = "bg-vermilion";
    animClass = "";
    label = "Failed";
  } else if (isLoading) {
    colorClass = "bg-amber";
    animClass = "motion-safe:animate-pulse";
    label = "Connecting\u2026";
  } else if (noVehicles) {
    colorClass = "bg-vermilion";
    animClass = "";
    label = "No vehicles";
  } else {
    colorClass = "bg-green";
    animClass = "";
    label = "System ready";
  }

  return (
    <div className="flex items-center gap-2" role="status" aria-label={label}>
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass} ${animClass} transition-colors duration-700`}
      />
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </span>
    </div>
  );
}

// ─── Full-width hazard stripe ─────────────────────────────────

function SafetyStripe() {
  return (
    <div className="h-1 bg-gradient-to-r from-vermilion via-amber to-vermilion" />
  );
}

// ─── Page shell (indicator + brand) reused in both views ─────

function PageShell({ status, vehiclesLoading, noVehicles, children }) {
  return (
    <main className="min-h-screen bg-surface">
      <SafetyStripe />
      <div className="mx-auto max-w-[480px] px-4 py-10">
        <div className="flex items-start justify-between mb-5">
          <SafetyIndicator
            status={status}
            vehiclesLoading={vehiclesLoading}
            noVehicles={noVehicles}
          />
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">
            S &middot; O &middot; S &middot; Vehicle Safety
          </span>
        </div>
        <div className="border-t border-hairline" />
        {children}
      </div>
    </main>
  );
}

// ─── Splash screen ─────────────────────────────────────────────

function SplashScreen({ onFinish }) {
  const [phase, setPhase] = useState("enter");
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const a = setTimeout(() => setPhase("visible"), 40);
    const b = setTimeout(() => setPhase("exit"), 2000);
    const c = setTimeout(() => onFinishRef.current(), 2600);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-surface transition-all duration-700 ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="h-1 bg-gradient-to-r from-vermilion via-amber to-vermilion" />
      <div className="flex flex-1 items-center justify-center px-4">
        <div
          className={`flex flex-col items-center gap-5 text-center transition-all duration-700 ${
            phase === "enter"
              ? "translate-y-6 opacity-0"
              : phase === "exit"
              ? "translate-y-4 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <div className="font-fraunces text-6xl font-bold leading-none tracking-tight text-text-primary">
            S<span className="text-vermilion">O</span>S
          </div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
            Vehicle Safety System
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green motion-safe:animate-pulse" />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-text-secondary">
              Initializing&hellip;
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────

export default function PassengerPage() {
  const [showSplash, setShowSplash] = useState(true);
  const [status, setStatus] = useState("idle");
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [takenSeats, setTakenSeats] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [lastRegistration, setLastRegistration] = useState(null);
  const [contactInput, setContactInput] = useState("");
  const [contactError, setContactError] = useState("");

  const urlVehicleId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("vehicleId") ?? ""
      : "";

  useEffect(() => {
    fetch(`${API_URL}/api/vehicles`)
      .then((r) => r.json())
      .then((data) => setVehicles(data.vehicles ?? []))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));
  }, []);

  useEffect(() => {
    if (urlVehicleId) setSelectedVehicleId(urlVehicleId);
  }, [urlVehicleId]);

  function normalizePhoneNumber(input) {
    const digits = input.replace(/\D/g, "");
    if (digits.startsWith("234")) return "+" + digits;
    if (digits.startsWith("0")) return "+234" + digits.slice(1);
    return "+234" + digits;
  }

  async function loadTakenSeats(vehicleId) {
    if (!vehicleId) {
      setTakenSeats([]);
      return;
    }
    try {
      const res = await fetch(
        `${API_URL}/api/passengers?vehicleId=${encodeURIComponent(vehicleId)}`
      );
      const data = await res.json();
      setTakenSeats((data.passengers ?? []).map((p) => p.seat));
    } catch {
      setTakenSeats([]);
    }
  }

  useEffect(() => {
    loadTakenSeats(selectedVehicleId);
  }, [selectedVehicleId]);

  useEffect(() => {
    const socket = io(API_URL);
    socket.on("passenger:registered", (data) => {
      const { passenger } = data;
      if (passenger.vehicleId === selectedVehicleId) {
        setTakenSeats((prev) =>
          prev.includes(passenger.seat) ? prev : [...prev, passenger.seat]
        );
      }
    });
    return () => socket.disconnect();
  }, [selectedVehicleId]);

  async function registerPassenger(event) {
    event.preventDefault();
    setStatus("sending");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const contact = normalizePhoneNumber(contactInput.trim());
    if (!/^\+234\d{10}$/.test(contact)) {
      setContactError("Enter a valid 11-digit Nigerian number");
      setStatus("failed");
      return;
    }

    const response = await fetch(`${API_URL}/api/passenger/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        seat: payload.seat,
        vehicleId: payload.vehicleId,
        contacts: [contact],
      }),
    });

    if (response.ok) {
      setContactInput("");
      setLastRegistration({
        name: payload.name,
        seat: payload.seat,
        vehicleId: payload.vehicleId,
        contact,
      });
      loadTakenSeats(payload.vehicleId);
    }
    setStatus(response.ok ? "sent" : "failed");
  }

  const vehicleOptions =
    urlVehicleId && !vehicles.includes(urlVehicleId)
      ? [urlVehicleId, ...vehicles]
      : vehicles;

  const locked = urlVehicleId !== "";
  const noVehicles = !vehiclesLoading && vehicleOptions.length === 0;

  // ── Success view ─────────────────────────────────────────────

  if (status === "sent" && lastRegistration) {
    const displayContact = lastRegistration.contact
      ? lastRegistration.contact.replace(
          /(\+234)(\d{3})(\d{3})(\d{4})/,
          "$1 $2 $3 $4"
        )
      : "";

    return (
      <>
        {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
        <PageShell
          status={status}
          vehiclesLoading={false}
          noVehicles={false}
        >
        <div className="mt-8 bg-white animate-fade-in-up">
          <div className="px-7 pt-10 pb-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green/10 mb-5">
              <svg
                className="h-6 w-6 text-green"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </span>
            <h1 className="font-fraunces text-[28px] font-bold leading-tight text-text-primary">
              Registration complete
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Your seat is registered. Your emergency contact will receive a
              location alert if this vehicle activates SOS.
            </p>
          </div>

          <div className="border-t border-hairline px-7 py-5">
            <div className="grid gap-4">
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                  Passenger
                </span>
                <p className="mt-0.5 text-sm font-medium text-text-primary">
                  {lastRegistration.name}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                  Seat
                </span>
                <p className="mt-0.5 font-mono text-sm font-medium text-text-primary">
                  {lastRegistration.seat}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                  Vehicle
                </span>
                <p className="mt-0.5 font-mono text-sm text-text-primary">
                  {lastRegistration.vehicleId}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
                  Emergency contact
                </span>
                <p className="mt-0.5 font-mono text-sm text-text-primary">
                  {displayContact}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-hairline px-7 py-5">
            <button
              className="w-full rounded-sm border border-hairline bg-white px-5 py-3 text-sm font-medium text-text-primary outline-none transition-all duration-200 hover:bg-input-bg active:scale-[0.98]"
              onClick={() => {
                setStatus("idle");
                setLastRegistration(null);
              }}
            >
              Register another passenger
            </button>
          </div>
        </div>
      </PageShell>
      </>
    );
  }

  // ── Form view ───────────────────────────────────────────────

  return (
    <>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <PageShell status={status} vehiclesLoading={vehiclesLoading} noVehicles={noVehicles}>
      <div className="mt-8 bg-white animate-fade-in-up">
        <div className="px-7 pt-8 pb-4">
          <h1 className="font-fraunces text-[28px] font-bold leading-tight text-text-primary">
            Passenger Safety Registration
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-secondary">
            Complete this form to register your seat and emergency contact with
            this vehicle&apos;s safety system.
          </p>
        </div>

        <form
          onSubmit={registerPassenger}
          className="divide-y divide-hairline"
        >
          {/* ── Full name ────────────────────────────────────── */}

          <label className="block px-7 py-5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
              </svg>
              Full name
            </span>
            <input
              className="mt-2 w-full border-0 border-b-2 border-transparent bg-transparent px-0 pb-1 pt-0.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-vermilion placeholder:text-text-secondary/50"
              name="name"
              placeholder="Enter your full name"
              required
              disabled={status === "sending"}
            />
          </label>

          {/* ── Vehicle ──────────────────────────────────────── */}

          <div className="px-7 py-5">
            <label
              htmlFor="vehicle"
              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h18M3 13a2 2 0 01-2-2V9a2 2 0 012-2h1l2-4h10l2 4h1a2 2 0 012 2v2a2 2 0 01-2 2m-18 0v4a1 1 0 001 1h16a1 1 0 001-1v-4" />
              </svg>
              Vehicle
            </label>
            <div className="mt-2">
              {vehiclesLoading ? (
                <div className="h-[26px] w-full animate-pulse rounded-sm bg-input-bg" />
              ) : noVehicles ? (
                <div className="flex items-center gap-2 text-sm text-vermilion">
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                    />
                  </svg>
                  No vehicles available
                </div>
              ) : (
                <div className="relative">
                  <select
                    id="vehicle"
                    className={`w-full appearance-none bg-transparent px-0 py-1 pr-5 text-sm font-medium outline-none transition-colors invalid:text-text-secondary/50 ${
                       locked
                         ? "text-green cursor-not-allowed"
                         : "text-text-primary"
                     }`}
                    name="vehicleId"
                    defaultValue={urlVehicleId || ""}
                    disabled={locked || status === "sending"}
                    required
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                  >
                    {!urlVehicleId && (
                      <option value="" disabled>
                        Select a vehicle
                      </option>
                    )}
                    {vehicleOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary/50">
                    {locked ? (
                      <svg
                        className="h-3.5 w-3.5 text-green"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <rect
                          x="3"
                          y="11"
                          width="18"
                          height="11"
                          rx="2"
                          ry="2"
                        />
                        <path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                    ) : (
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              )}
              {locked && (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-text-secondary">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                  >
                    <rect
                      x="3"
                      y="11"
                      width="18"
                      height="11"
                      rx="2"
                      ry="2"
                    />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Set by QR code
                </p>
              )}
              {locked && (
                <input type="hidden" name="vehicleId" value={urlVehicleId} />
              )}
            </div>
          </div>

          {/* ── Seat number ──────────────────────────────────── */}

          <div className="px-7 py-5">
            <label
              htmlFor="seat"
              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v16M7 4a2 2 0 012-2h6a2 2 0 012 2M7 4H4m16 0h-3M7 20a2 2 0 002 2h6a2 2 0 002-2M7 20H4m16 0h-3M4 10h16M4 14h16" />
              </svg>
              Seat number
            </label>
            <div className="relative mt-2">
              <select
                id="seat"
                className="w-full appearance-none bg-transparent px-0 py-1 pr-5 text-sm font-medium text-text-primary outline-none transition-colors disabled:opacity-30"
                name="seat"
                required
                key={selectedVehicleId}
                defaultValue=""
                disabled={status === "sending" || !selectedVehicleId}
              >
                <option value="" disabled>
                  {selectedVehicleId
                    ? "Select a seat\u2026"
                    : "Select a vehicle first\u2026"}
                </option>
                {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
                  const taken = takenSeats.includes(String(n));
                  return (
                    <option key={n} value={n} disabled={taken}>
                      Seat {n}
                      {taken ? " (Taken)" : ""}
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary/50">
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* ── Emergency contact ────────────────────────────── */}

          <label className="block px-7 py-5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-text-secondary">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              Emergency contact
            </span>
            <div className="mt-2 flex border-b-2 border-transparent transition-colors focus-within:border-vermilion">
              <span className="shrink-0 text-sm font-medium text-text-secondary">
                +234
              </span>
              <input
                className="w-full border-none bg-transparent px-2 pb-1 pt-0.5 text-sm font-medium text-text-primary outline-none placeholder:text-text-secondary/50"
                name="contacts"
                type="tel"
                value={contactInput}
                onChange={(e) => {
                  setContactError("");
                  setContactInput(e.target.value.replace(/[^0-9\s-]/g, ""));
                }}
                placeholder="703 508 1328"
                required
                disabled={status === "sending"}
              />
            </div>
            {contactError && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-vermilion">
                {contactError}
              </p>
            )}
          </label>

          {/* ── Submit ───────────────────────────────────────── */}

          <div className="px-7 py-5">
            <button
              className="w-full rounded-sm bg-vermilion px-5 py-3 text-sm font-medium text-white outline-none transition-all duration-200 hover:bg-[#b02d20] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
              type="submit"
              disabled={
                status === "sending" || vehiclesLoading || noVehicles
              }
            >
              {status === "sending" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Recording\u2026
                </span>
              ) : (
                "Complete registration"
              )}
            </button>
          </div>

          {/* ── Error banner ─────────────────────────────────── */}

          {status === "failed" && !contactError && (
            <div className="px-7 py-4">
              <div className="flex items-center gap-2 text-sm text-vermilion">
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                Could not register. Please try again.
              </div>
            </div>
          )}

          {/* ── Safety notice ────────────────────────────────── */}

          <div className="px-7 py-4">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-text-secondary">
              <span className="mt-px shrink-0">&#9888;</span>
              In an emergency, hold the SOS button inside the vehicle for 10
              seconds. Your contact will receive a location alert.
            </p>
          </div>
        </form>
      </div>
    </PageShell>
    </>
  );
}

