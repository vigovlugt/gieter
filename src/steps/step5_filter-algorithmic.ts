import { createStep } from "../cache";
import type { AlgorithmicEnrichment, GiteListing } from "../schema";

// Minimum socialProof score (out of 10) required to proceed to AI enrichment.
// Saves API credits by skipping duds that are already poor on objective criteria.
const MIN_ALGORITHMIC_SCORE = 7.0;

type Input = (GiteListing & { distanceKm: number; algorithmic: AlgorithmicEnrichment })[];
type Output = Input;

export default createStep<Input, Output>("filter-algorithmic", "3", (listings) => {
  const filtered = listings.filter((listing) => {
    const avg = listing.algorithmic.socialProof.score;

    if (avg < MIN_ALGORITHMIC_SCORE) {
      process.stderr.write(
        `[filter-algorithmic] Dropping "${listing.title}" (${listing.ref}) — socialProof ${avg.toFixed(1)} < ${MIN_ALGORITHMIC_SCORE}\n`
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
