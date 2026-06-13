"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function PassengerPage() {
  const [status, setStatus] = useState("idle");
  const [vehicles, setVehicles] = useState([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);

  // Read ?vehicleId= from the URL to pre-select and lock the dropdown
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

  async function registerPassenger(event) {
    event.preventDefault();
    setStatus("sending");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const contacts = String(payload.contacts)
      .split(",")
      .map((contact) => contact.trim())
      .filter(Boolean);

    const response = await fetch(`${API_URL}/api/passenger/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: payload.name,
        seat: payload.seat,
        vehicleId: payload.vehicleId,
        contacts,
      }),
    });

    setStatus(response.ok ? "sent" : "failed");
  }

  // Merge URL vehicle into the list so it is always selectable even if the
  // backend list hasn't loaded yet or doesn't include it yet.
  const vehicleOptions =
    urlVehicleId && !vehicles.includes(urlVehicleId)
      ? [urlVehicleId, ...vehicles]
      : vehicles;

  const locked = urlVehicleId !== "";

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f3] px-6 py-8 text-[#17211c]">
      <section className="w-full max-w-[520px] rounded-lg border border-[#d7ded5] bg-white p-7 shadow-[0_18px_50px_rgb(29_45_34_/_10%)]">
        <p className="mb-2 text-xs font-bold uppercase text-[#2f6b4f]">Smart Vehicle SOS</p>
        <h1 className="mb-2 text-3xl font-bold leading-tight">Register passenger</h1>
        <p className="mb-6 text-sm leading-6 text-[#5f6a72]">
          Boarding details are linked to the vehicle so emergency contacts can be
          sent to the bus device when a trip starts.
        </p>

        <form className="grid gap-[18px]" onSubmit={registerPassenger}>
          <label className="grid gap-2.5 font-semibold text-[#324039]">
            Passenger name
            <input
              className="w-full rounded-md border border-[#c8d1c7] px-3.5 py-3 font-normal outline-none transition focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
              name="name"
              placeholder="Full name"
              required
            />
          </label>

          <label className="grid gap-2.5 font-semibold text-[#324039]">
            Seat
            <input
              className="w-full rounded-md border border-[#c8d1c7] px-3.5 py-3 font-normal outline-none transition focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
              name="seat"
              placeholder="A12"
              required
            />
          </label>

          <label className="grid gap-2.5 font-semibold text-[#324039]">
            Vehicle ID
            <div className="relative">
              {vehiclesLoading ? (
                <div className="flex h-[50px] w-full items-center rounded-md border border-[#c8d1c7] px-3.5 text-sm text-[#8a9ba8]">
                  Loading vehicles…
                </div>
              ) : vehicleOptions.length === 0 ? (
                <div className="flex h-[50px] w-full items-center rounded-md border border-[#f2c6ce] bg-[#fff7f8] px-3.5 text-sm text-[#a31328]">
                  No vehicles available — ask the operator to start a trip first.
                </div>
              ) : (
                <select
                  className={`w-full appearance-none rounded-md border px-3.5 py-3 font-normal outline-none transition ${
                    locked
                      ? "border-[#b3cfc3] bg-[#f0f7f4] text-[#2f6b4f] cursor-not-allowed"
                      : "border-[#c8d1c7] bg-white focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
                  }`}
                  name="vehicleId"
                  defaultValue={urlVehicleId || ""}
                  disabled={locked}
                  required
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
              )}

              {/* Chevron icon */}
              {!vehiclesLoading && vehicleOptions.length > 0 && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9ba8]">
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
              )}
            </div>
            {locked && (
              <p className="mt-0.5 text-xs text-[#5f6a72]">
                Vehicle ID set by the QR code — cannot be changed.
              </p>
            )}
            {/* Hidden input so a disabled <select> value still submits */}
            {locked && <input type="hidden" name="vehicleId" value={urlVehicleId} />}
          </label>

          <label className="grid gap-2.5 font-semibold text-[#324039]">
            Emergency contacts
            <input
              className="w-full rounded-md border border-[#c8d1c7] px-3.5 py-3 font-normal outline-none transition focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
              name="contacts"
              placeholder="+2348012345678, +2348098765432"
              required
            />
          </label>

          <button
            className="cursor-pointer rounded-md bg-[#c71f37] px-4 py-3.5 font-bold text-white transition hover:bg-[#a31328] disabled:cursor-wait disabled:opacity-70"
            type="submit"
            disabled={status === "sending" || vehiclesLoading || vehicleOptions.length === 0}
          >
            {status === "sending" ? "Registering…" : "Register passenger"}
          </button>

          {status === "sent" && (
            <p className="m-0 text-[#21784a]">Passenger registered for this vehicle.</p>
          )}
          {status === "failed" && (
            <p className="m-0 text-[#a31328]">Could not register passenger. Please try again.</p>
          )}
        </form>
      </section>
    </main>
  );
}
