const cache = new Map();

let pending = null;

export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  const key = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  if (pending) await pending;

  const promise = fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
    { headers: { "User-Agent": "SmartVehicleSOS/1.0", "Accept-Language": "en" } }
  )
    .then((r) => r.json())
    .then((data) => {
      const addr = data?.address;
      const name = addr?.city || addr?.town || addr?.village || addr?.state_district || addr?.state || null;
      cache.set(key, name);
      return name;
    })
    .catch(() => {
      cache.set(key, null);
      return null;
    });

  pending = promise;
  const result = await promise;
  pending = null;
  return result;
}
