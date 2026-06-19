"use client";

import { useRouter } from "next/navigation";

export default function VehicleSelector({ vehicles, currentVehicleId }) {
  const router = useRouter();

  function handleChange(event) {
    const id = event.target.value;
    if (id && id !== currentVehicleId) {
      router.push(`/vehicle/${id}`);
    }
  }

  if (vehicles.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="vehicle-select" className="text-sm font-semibold text-text-secondary">
        Vehicle:
      </label>
      <select
        id="vehicle-select"
        value={currentVehicleId}
        onChange={handleChange}
        className="rounded-lg border border-border-default bg-surface-card px-3.5 py-2 text-sm font-medium text-text-primary outline-none ring-brand-200 transition-all duration-150 focus:border-brand-500 focus:ring-2"
      >
        {vehicles.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </div>
  );
}
