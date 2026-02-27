import { createStep } from "../cache";
import type { AlgorithmicEnrichment, GiteListing } from "../schema";

// Minimum average algorithmic score (out of 10) required to proceed to AI enrichment.
// Saves API credits by skipping duds that are already poor on objective criteria.
const MIN_ALGORITHMIC_SCORE = 5.0;

type Input = (GiteListing & { distanceKm: number; algorithmic: AlgorithmicEnrichment })[];
type Output = Input;

export default createStep<Input, Output>("filter-algorithmic", "1", (listings) => {
  const filtered = listings.filter((listing) => {
    const { value, socialProof, practicalAmenities } = listing.algorithmic;
    const avg = (value.score + socialProof.score + practicalAmenities.score) / 3;

    if (avg < MIN_ALGORITHMIC_SCORE) {
      process.stderr.write(
        `[filter-algorithmic] Dropping "${listing.title}" (${listing.ref}) — algorithmic avg ${avg.toFixed(1)} < ${MIN_ALGORITHMIC_SCORE}\n`
      );
      return false;
    }

    return true;
  });

  process.stderr.write(
    `[filter-algorithmic] ${filtered.length}/${listings.length} listings pass algorithmic threshold (≥${MIN_ALGORITHMIC_SCORE})\n`
  );

  return filtered;
});
