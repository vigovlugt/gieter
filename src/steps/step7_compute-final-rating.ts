import { createStep } from "../cache";
import type { AiEnrichment, AlgorithmicEnrichment, GiteEnrichment, GiteListing } from "../schema";

// ─── Final rating ─────────────────────────────────────────────────────────────
//
// Equal weight across all 7 components (1/7 each):
//   algorithmic: value, socialProof, practicalAmenities
//   ai: outdoorChillPotential, groupComfort, locationVibe, miscellaneous

function computeFinalRating(algorithmic: AlgorithmicEnrichment, ai: AiEnrichment): number {
  const scores = [
    algorithmic.value.score,
    algorithmic.socialProof.score,
    algorithmic.practicalAmenities.score,
    ai.outdoorChillPotential.score,
    ai.groupComfort.score,
    ai.locationVibe.score,
    ai.miscellaneous.score,
  ];
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

// ─── Step ────────────────────────────────────────────────────────────────────

type Input = (GiteListing & { distanceKm: number; algorithmic: AlgorithmicEnrichment; ai: AiEnrichment })[];
type Output = (GiteListing & { distanceKm: number; enrichment: GiteEnrichment })[];

export default createStep<Input, Output>("compute-final-rating", "2", (listings) => {
  return listings.map((listing) => {
    const finalRating = computeFinalRating(listing.algorithmic, listing.ai);

    const enrichment: GiteEnrichment = {
      algorithmic: listing.algorithmic,
      ai: listing.ai,
      finalRating,
    };

    // Fold algorithmic + ai under enrichment, drop the intermediate fields
    const { algorithmic: _a, ai: _b, ...rest } = listing;
    return { ...rest, enrichment };
  });
});
