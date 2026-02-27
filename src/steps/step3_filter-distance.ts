import { createStep } from "../cache";
import type { GiteListing } from "../schema";

const REF_LAT = parseFloat(process.env["LAT"] ?? "52.3676");
const REF_LON = parseFloat(process.env["LON"] ?? "4.9041");
const MAX_KM = parseFloat(process.env["MAX_KM"] ?? "700");

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export default createStep<GiteListing[], (GiteListing & { distanceKm: number })[]>("filter-distance", "1", async (listings) => {
  const filtered = listings
    .flatMap((listing) => {
      const { latitude, longitude } = listing.location;
      if (latitude == null || longitude == null) return [];
      const distanceKm = Math.round(haversineKm(REF_LAT, REF_LON, latitude, longitude));
      if (distanceKm > MAX_KM) return [];
      return [{ ...listing, distanceKm }];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  process.stderr.write(
    `Filtered ${listings.length} listings → ${filtered.length} within ${MAX_KM} km of (${REF_LAT}, ${REF_LON})\n`
  );

  return filtered;
});
