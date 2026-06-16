"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function PassengerPage() {
  const [status, setStatus] = useState("idle");
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [takenSeats, setTakenSeats] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
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

  useEffect(() => {
    if (!vehiclesLoading) {
      const timer = setTimeout(() => {
        setShowContent(true);
        setTimeout(() => setPageLoading(false), 400);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [vehiclesLoading]);

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

  if (pageLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#f2f7f4] to-[#e4ede7] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-8">
          <div className="relative flex items-center justify-center">
            <span className="absolute h-28 w-28 rounded-full bg-[#c71f37]/10 animate-ripple" />
            <span className="absolute h-28 w-28 rounded-full bg-[#c71f37]/10 animate-ripple [animation-delay:0.4s]" />
            <span className="absolute h-28 w-28 rounded-full bg-[#c71f37]/10 animate-ripple [animation-delay:0.8s]" />
            <span className="absolute h-28 w-28 rounded-full bg-[#c71f37]/10 animate-ripple [animation-delay:1.2s]" />
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#c71f37] shadow-[0_0_32px_-4px_rgba(199,31,55,0.35)] animate-heartbeat">
              <svg className="h-9 w-9 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0" />
              </svg>
            </span>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2f6b4f]">
              Smart Vehicle SOS
            </p>
            <p className="mt-2 text-xs text-[#8a9ba8] animate-pulse">Loading…</p>
          </div>
        </div>
      </main>
    );
  }

  if (status === "sent" && lastRegistration) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#f2f7f4] to-[#e4ede7] flex items-center justify-center px-4 py-10">
        <div className="relative w-full max-w-[440px]">
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <span className="h-72 w-72 rounded-full bg-[#1a6d3e]/5 animate-ripple" style={{ animationDuration: "3s" }} />
          </div>
          <div className="relative rounded-2xl border border-white/60 bg-white/95 px-8 py-10 shadow-[0_24px_64px_-16px_rgba(23,33,28,0.12)] backdrop-blur-sm text-center">
            <div className="flex justify-center mb-6">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1a6d3e] animate-scale-bounce shadow-[0_0_32px_-4px_rgba(26,109,62,0.3)]">
                <svg className="h-9 w-9 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            </div>

            <h2 className="text-2xl font-bold text-[#17211c]">Registered!</h2>
            <p className="mt-1.5 text-sm text-[#5f6a72]">
              Passenger boarding confirmed.
            </p>

            <div className="mt-6 grid gap-3 rounded-xl bg-[#f0f5f2] px-5 py-4 text-left text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[#5f6a72]">Name</span>
                <span className="font-semibold text-[#17211c]">{lastRegistration.name}</span>
              </div>
              <div className="h-px bg-[#d7ded5]" />
              <div className="flex items-center justify-between">
                <span className="text-[#5f6a72]">Seat</span>
                <span className="font-semibold text-[#17211c]">{lastRegistration.seat}</span>
              </div>
              <div className="h-px bg-[#d7ded5]" />
              <div className="flex items-center justify-between">
                <span className="text-[#5f6a72]">Vehicle</span>
                <span className="font-semibold text-[#17211c]">{lastRegistration.vehicleId}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c71f37]/10 animate-heartbeat">
                <svg className="h-5 w-5 text-[#c71f37]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0" />
                </svg>
              </span>
            </div>

            <button
              className="mt-6 w-full cursor-pointer rounded-xl border border-[#d7ded5] bg-white px-5 py-3 text-sm font-semibold text-[#2f6b4f] outline-none transition-all duration-200 hover:bg-[#f0f5f2] hover:border-[#b3cfc3] active:scale-[0.97]"
              onClick={() => {
                setStatus("idle");
                setLastRegistration(null);
              }}
            >
              Register another passenger
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`relative min-h-screen bg-gradient-to-b from-[#f2f7f4] to-[#e4ede7] flex items-center justify-center px-4 py-10 transition-all duration-500 ${
        showContent ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="w-full max-w-[464px] animate-fade-in-up">
        <div className="rounded-2xl border border-white/60 bg-white/95 px-8 py-9 shadow-[0_24px_64px_-16px_rgba(23,33,28,0.12)] backdrop-blur-sm">

          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#c71f37]">
              <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0" />
              </svg>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#2f6b4f]">
              Smart Vehicle SOS
            </span>
          </div>

          <h1 className="mt-4 text-[26px] font-bold leading-tight text-[#17211c]">
            Register passenger
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#5f6a72]">
            Boarding details are linked to the vehicle so emergency contacts are
            sent to the bus device when a trip starts.
          </p>

          <form className="mt-7 grid gap-5" onSubmit={registerPassenger}>
            <label className="grid gap-1.5 text-sm font-semibold text-[#324039]">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#7a8f80]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Passenger name
              </span>
              <input
                className="w-full rounded-xl border border-[#d7ded5] bg-white px-4 py-3 text-sm font-normal text-[#17211c] outline-none transition-all duration-200 placeholder:text-[#a3b1a8] focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
                name="name"
                placeholder="Full name"
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-[#324039]">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#7a8f80]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Vehicle ID
              </span>
              <div className="relative">
                {vehiclesLoading ? (
                  <div className="flex h-[48px] w-full animate-pulse items-center gap-2 rounded-xl border border-[#e5ebe5] bg-[#f0f5f2] px-4 text-sm text-[#8a9ba8]">
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a9ba8] [animation-delay:0ms]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a9ba8] [animation-delay:150ms]" />
                    <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-[#8a9ba8] [animation-delay:300ms]" />
                  </div>
                ) : vehicleOptions.length === 0 ? (
                  <div className="flex h-[48px] w-full items-center gap-2 rounded-xl border border-[#fbd5d9] bg-[#fff8f9] px-4 text-sm text-[#b91c30]">
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    No vehicles available
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      className={`w-full appearance-none rounded-xl border px-4 py-3 pr-10 text-sm font-normal outline-none transition-all duration-200 ${
                        locked
                          ? "border-[#c8dcd0] bg-[#f0f7f4] text-[#2f6b4f] cursor-not-allowed"
                          : "border-[#d7ded5] bg-white text-[#17211c] focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
                      }`}
                      name="vehicleId"
                      defaultValue={urlVehicleId || ""}
                      disabled={locked}
                      required
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                    >
                      {!urlVehicleId && (
                        <option value="" disabled>
                          Select a vehicle…
                        </option>
                      )}
                      {vehicleOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a9ba8]">
                      {locked ? (
                        <svg className="h-4 w-4 text-[#2f6b4f]" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5l-4-4h8l-4 4z" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </span>
                  </div>
                )}
              </div>
              {locked && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-[#5f6a72]">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Set by QR code
                </p>
              )}
              {locked && <input type="hidden" name="vehicleId" value={urlVehicleId} />}
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-[#324039]">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#7a8f80]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                Seat
              </span>
              <div className="relative">
                <select
                  className="w-full appearance-none rounded-xl border border-[#d7ded5] bg-white px-4 py-3 pr-10 text-sm font-normal text-[#17211c] outline-none transition-all duration-200 focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
                  name="seat"
                  required
                  key={selectedVehicleId}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select a seat…
                  </option>
                  {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => {
                    const taken = takenSeats.includes(String(n));
                    return (
                      <option
                        key={n}
                        value={n}
                        disabled={taken}
                        className={taken ? "text-[#b0b8b0]" : ""}
                      >
                        Seat {n}{taken ? " (Taken)" : ""}
                      </option>
                    );
                  })}
                </select>
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8a9ba8]">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </div>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-[#324039]">
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5 text-[#7a8f80]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Emergency contact
              </span>
              <div className="flex rounded-xl border border-[#d7ded5] bg-white overflow-hidden focus-within:border-[#2f6b4f] focus-within:ring-2 focus-within:ring-[#2f6b4f]/15 transition-all duration-200">
                <span className="flex items-center gap-1 shrink-0 bg-[#f0f5f2] px-3 text-sm font-medium text-[#324039] border-r border-[#d7ded5]">
                  <span>🇳🇬</span>
                  <span>+234</span>
                </span>
                <input
                  className="w-full border-none px-3 py-3 text-sm font-normal text-[#17211c] outline-none placeholder:text-[#a3b1a8]"
                  name="contacts"
                  type="tel"
                  value={contactInput}
                  onChange={(e) => {
                    setContactError("");
                    setContactInput(e.target.value.replace(/[^0-9\s-]/g, ""));
                  }}
                  placeholder="703 508 1328"
                  required
                />
              </div>
              {contactError && (
                <p className="flex items-center gap-1 text-xs text-[#b91c30]">{contactError}</p>
              )}
            </label>

            <button
              className="relative flex w-full items-center justify-center gap-2.5 cursor-pointer rounded-xl bg-[#c71f37] px-5 py-3.5 text-sm font-bold text-white outline-none transition-all duration-200 hover:bg-[#a31328] hover:shadow-[0_8px_24px_-6px_rgba(199,31,55,0.35)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-none disabled:active:scale-100"
              type="submit"
              disabled={
                status === "sending" || vehiclesLoading || vehicleOptions.length === 0
              }
            >
              {status === "sending" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Registering…
                </>
              ) : (
                <>
                  Register passenger
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>

            {status === "failed" && (
              <div className="animate-slide-down flex items-center gap-2.5 rounded-xl border border-[#fbd5d9] bg-[#fff8f9] px-4 py-3 text-sm text-[#b91c30]">
                <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Could not register passenger. Please try again.
              </div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
