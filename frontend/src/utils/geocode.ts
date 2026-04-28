export const geocodeCache = new Map<string, string>();

export async function getCityFromCoords(lat: number, lng: number): Promise<string> {
    // Round to 3 decimal places to cluster nearby locations into the same cache key
    const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;

    if (geocodeCache.has(key)) {
        return geocodeCache.get(key)!;
    }

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        if (!res.ok) throw new Error("Networking block");

        const data = await res.json();
        const city = data.address?.city || data.address?.state_district || data.address?.town || data.address?.county || "Unknown Zone";

        geocodeCache.set(key, city);
        return city;
    } catch (err) {
        console.error("Geocoding failed:", err);
        return "Unknown Zone";
    }
}
