"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
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

function MapBoundsUpdater({ markers }) {
  const map = useMap();
  const valid = markers.filter((m) => m.lat && m.lng);
  if (valid.length > 0) {
    const bounds = L.latLngBounds(valid.map((m) => [m.lat, m.lng]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
  return null;
}

export default function OverviewMapInner({ gpsData, connected }) {
  const markers = Object.entries(gpsData).map(([vehicleId, gps]) => ({
    vehicleId,
    lat: Number(gps.lat),
    lng: Number(gps.lng),
    timestamp: gps.timestamp
  }));

  const defaultCenter = markers.length > 0
    ? [markers[0].lat, markers[0].lng]
    : [9.082, 8.675];

  return (
    <div className="relative h-[500px] overflow-hidden rounded-xl ring-1 ring-border-default">
      {!connected && (
        <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-text-muted shadow-sm backdrop-blur">
          Disconnected &mdash; data may be stale
        </div>
      )}
      <MapContainer
        center={defaultCenter}
        zoom={6}
        className="h-full w-full"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapBoundsUpdater markers={markers} />
        {markers.map((m) => (
          <Marker key={m.vehicleId} position={[m.lat, m.lng]}>
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{m.vehicleId}</p>
                <p className="text-xs text-text-secondary">
                  {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
                </p>
                {m.timestamp && (
                  <p className="text-xs text-text-muted">
                    {new Date(m.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {markers.length === 0 && (
          <div className="absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-text-secondary shadow-sm backdrop-blur">
            Waiting for GPS data from vehicles...
          </div>
        )}
      </MapContainer>
    </div>
  );
}
