"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { getCoordinates } from "../data/stateCoordinates";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

const staticVehicleIcon = L.divIcon({
  className: "",
  html: `<div style="background:#1f6f50;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid white;font-size:16px;font-weight:bold;">🚍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20]
});

const activeVehicleIcon = L.divIcon({
  className: "",
  html: `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;"> \
<div style="position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(31,111,80,0.25);animation:pulse-map 2s ease-in-out infinite;"></div> \
<div style="background:#1f6f50;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid white;font-size:16px;font-weight:bold;">🚍</div> \
</div>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
  popupAnchor: [0, -24]
});

const originIcon = L.divIcon({
  className: "",
  html: `<div style="background:#1f6f50;color:white;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 3px rgba(31,111,80,0.25);border:2px solid white;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="background:#c71f37;color:white;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 3px rgba(199,31,55,0.2);border:2px solid white;"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

function MapBoundsUpdater({ points }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
    }
  }, [map, points]);

  return null;
}

export default function VehicleMapInner({ vehicleId, lat, lng, timestamp, connected, origin, destination, isActive }) {
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);

  const hasValidCoords = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
  const vehiclePos = hasValidCoords ? [Number(lat), Number(lng)] : null;

  const originCoords = origin ? getCoordinates(origin) : null;
  const destCoords = destination ? getCoordinates(destination) : null;
  const hasRoute = originCoords && destCoords;

  useEffect(() => {
    if (!hasRoute) {
      setRouteCoords(null);
      return;
    }

    let cancelled = false;

    async function fetchRoute() {
      setRouteLoading(true);
      const url = `${OSRM_BASE}/${originCoords[1]},${originCoords[0]};${destCoords[1]},${destCoords[0]}?geometries=geojson&overview=full`;

      try {
        const res = await fetch(url);
        const data = await res.json();
        if (cancelled) return;

        if (data.code === "Ok" && data.routes?.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          setRouteCoords(coords);
        }
      } catch {
        if (!cancelled) setRouteCoords(null);
      } finally {
        if (!cancelled) setRouteLoading(false);
      }
    }

    fetchRoute();

    return () => { cancelled = true; };
  }, [origin, destination, hasRoute, originCoords, destCoords]);

  const polylineCoords = routeCoords ?? (hasRoute ? [originCoords, destCoords] : null);
  const polylineOptions = routeCoords
    ? { color: "#eab308", weight: 4, opacity: 0.8 }
    : hasRoute
      ? { color: "#eab308", weight: 3, opacity: 0.5, dashArray: "8 6" }
      : null;

  const allPoints = [...(polylineCoords ?? []), vehiclePos].filter(Boolean);

  const center = allPoints.length > 1
    ? [
        allPoints.reduce((s, p) => s + p[0], 0) / allPoints.length,
        allPoints.reduce((s, p) => s + p[1], 0) / allPoints.length
      ]
    : vehiclePos ?? originCoords ?? destCoords ?? [9.082, 8.675];

  const zoom = allPoints.length > 1 ? 8 : (hasValidCoords ? 15 : 6);
  const vehicleIcon = isActive ? activeVehicleIcon : staticVehicleIcon;

  return (
    <div className="relative h-[500px] overflow-hidden rounded-xl ring-1 ring-border-default">
      {!connected && (
        <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-text-muted shadow-sm backdrop-blur">
          Disconnected &mdash; data may be stale
        </div>
      )}
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {allPoints.length > 1 && <MapBoundsUpdater points={allPoints} />}

        {routeLoading && hasRoute && (
          <div className="absolute left-3 top-12 z-[1000] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-text-muted shadow-sm backdrop-blur">
            Loading route&hellip;
          </div>
        )}

        {polylineCoords && polylineOptions && (
          <>
            <Polyline positions={polylineCoords} pathOptions={polylineOptions} />
            <Marker position={originCoords} icon={originIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold text-brand-600">Origin</p>
                  <p className="text-xs text-text-secondary">{origin}</p>
                </div>
              </Popup>
            </Marker>
            <Marker position={destCoords} icon={destinationIcon}>
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold text-danger-600">Destination</p>
                  <p className="text-xs text-text-secondary">{destination}</p>
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {vehiclePos && (
          <Marker position={vehiclePos} icon={vehicleIcon}>
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{vehicleId}</p>
                {origin && destination && (
                  <p className="text-xs text-text-secondary">
                    {origin} &rarr; {destination}
                  </p>
                )}
                <p className="text-xs text-text-secondary mt-1">
                  {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
                </p>
                {timestamp && (
                  <p className="text-xs text-text-muted">
                    Updated: {new Date(timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {!vehiclePos && !originCoords && !destCoords && (
          <div className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-text-secondary shadow-sm backdrop-blur">
            No GPS data for {vehicleId} yet.
          </div>
        )}
      </MapContainer>
    </div>
  );
}
