"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function PassengerPage() {
  const [status, setStatus] = useState("idle");

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
        contacts
      })
    });

    setStatus(response.ok ? "sent" : "failed");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f7f3] px-6 py-8 text-[#17211c]">
      <section className="w-full max-w-[520px] rounded-lg border border-[#d7ded5] bg-white p-7 shadow-[0_18px_50px_rgb(29_45_34_/_10%)]">
        <p className="mb-2 text-xs font-bold uppercase text-[#2f6b4f]">Smart Vehicle SOS</p>
        <h1 className="mb-2 text-3xl font-bold leading-tight">Register passenger</h1>
        <p className="mb-6 text-sm leading-6 text-[#5f6a72]">
          Boarding details are linked to the vehicle so emergency contacts can be sent to the bus device when a trip starts.
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
            <input
              className="w-full rounded-md border border-[#c8d1c7] px-3.5 py-3 font-normal outline-none transition focus:border-[#2f6b4f] focus:ring-2 focus:ring-[#2f6b4f]/15"
              name="vehicleId"
              placeholder="Vehicle plate or device ID"
              required
            />
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
            disabled={status === "sending"}
          >
            {status === "sending" ? "Registering..." : "Register passenger"}
          </button>
          {status === "sent" && <p className="m-0 text-[#21784a]">Passenger registered for this vehicle.</p>}
          {status === "failed" && <p className="m-0 text-[#a31328]">Could not register passenger. Please try again.</p>}
        </form>
      </section>
    </main>
  );
}
