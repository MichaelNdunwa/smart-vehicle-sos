"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

const vehicleIcon = L.divIcon({
  className: "",
  html: `<div style="background:#1f6f50;color:white;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:3px solid white;font-size:16px;font-weight:bold;">🚍</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20]
});

export default function VehicleMapInner({ vehicleId, lat, lng, timestamp, connected }) {
  const hasValidCoords = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
  const center = hasValidCoords ? [Number(lat), Number(lng)] : [9.082, 8.675];
  const zoom = hasValidCoords ? 15 : 6;

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
        {hasValidCoords && (
          <Marker position={[Number(lat), Number(lng)]} icon={vehicleIcon}>
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{vehicleId}</p>
                <p className="text-xs text-text-secondary">
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
        {!hasValidCoords && (
          <div className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-text-secondary shadow-sm backdrop-blur">
            No GPS data for {vehicleId} yet.
          </div>
        )}
      </MapContainer>
    </div>
  );
}
