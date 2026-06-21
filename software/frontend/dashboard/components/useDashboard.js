"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const initialState = {
  passengers: [],
  contacts: [],
  trips: [],
  gpsLogs: [],
  sosAlerts: [],
  hardwareLogs: []
};

export function useDashboard() {
  const [dashboard, setDashboard] = useState(initialState);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/dashboard`)
      .then((response) => response.json())
      .then((data) => setDashboard({ ...initialState, ...data }))
      .catch(() => setDashboard(initialState));

    const socket = io(API_URL);

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("dashboard:sync", (state) => setDashboard({ ...initialState, ...state }));
    socket.on("hardware:log", (log) => {
      setDashboard((prev) => ({ ...prev, hardwareLogs: [log, ...prev.hardwareLogs] }));
    });

    return () => socket.disconnect();
  }, []);

  const activeTrips = useMemo(
    () => dashboard.trips.filter((trip) => trip.status === "active"),
    [dashboard.trips]
  );

  const latestGpsByVehicle = useMemo(() => {
    return dashboard.gpsLogs.reduce((latest, gpsLog) => {
      latest[gpsLog.vehicleId] = gpsLog;
      return latest;
    }, {});
  }, [dashboard.gpsLogs]);

  return { dashboard, connected, activeTrips, latestGpsByVehicle };
}
