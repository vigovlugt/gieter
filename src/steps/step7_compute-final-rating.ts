import { createStep } from "../cache";
import type { AiEnrichment, AlgorithmicEnrichment, GiteEnrichment, GiteListing, RatingComponent } from "../schema";

const GROUP_SIZE = 8;

// ─── Value for money ──────────────────────────────────────────────────────────
//
// quality / price — where quality is the average of the other 5 components
// (socialProof + 4 AI scores). The raw ratio is then normalised across all
// listings so the best ratio → 9 and the worst → 2.
//
// Inclusion bonus applied to price before the ratio:
//   all-inclusive → price × 0.85 (effectively cheaper)
//   ≥2 items included → price × 0.93

type ListingWithScores = GiteListing & {
  distanceKm: number;
  algorithmic: AlgorithmicEnrichment;
  ai: AiEnrichment;
};

function qualityScore(algorithmic: AlgorithmicEnrichment, ai: AiEnrichment): number {
  const scores = [
    algorithmic.socialProof.score,
    ai.outdoorChillPotential.score,
    ai.groupComfort.score,
    ai.locationVibe.score,
    ai.miscellaneous.score,
  ];
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

function effectivePrice(listing: GiteListing): number {
  const pp = listing.price.amount / GROUP_SIZE;
  if (listing.allInclusive) return pp * 0.85;
  if (listing.priceIncludes.length >= 2) return pp * 0.93;
  return pp;
}

function scoreValue(listing: ListingWithScores, allListings: ListingWithScores[]): RatingComponent {
  const quality = qualityScore(listing.algorithmic, listing.ai);
  const price = effectivePrice(listing);
  const ratio = quality / price;

  const allRatios = allListings.map((l) => qualityScore(l.algorithmic, l.ai) / effectivePrice(l));
  const min = Math.min(...allRatios);
  const max = Math.max(...allRatios);

  const score =
    min === max
      ? 5.5
      : Math.round(Math.min(9, Math.max(2, 2 + ((ratio - min) / (max - min)) * 7)) * 10) / 10;

  const pp = (listing.price.amount / GROUP_SIZE).toFixed(2);
  const inclText = listing.allInclusive
    ? "all-inclusive (price adjusted ×0.85)"
    : listing.priceIncludes.length >= 2
      ? `includes ${listing.priceIncludes.slice(0, 2).join(", ").toLowerCase()} (price adjusted ×0.93)`
      : "few extras included";

  return {
    score,
    reason: `Quality avg ${quality.toFixed(1)}/10 at €${pp}/person/night — ${inclText}. Ratio ranked across all listings.`,
  };
}

// ─── Final rating ─────────────────────────────────────────────────────────────
//
// Equal weight across all 6 components (1/6 each):
//   value (computed here), socialProof, outdoorChillPotential, groupComfort, locationVibe, miscellaneous

function computeFinalRating(value: RatingComponent, algorithmic: AlgorithmicEnrichment, ai: AiEnrichment): number {
  const scores = [
    value.score,
    algorithmic.socialProof.score,
    ai.outdoorChillPotential.score,
    ai.groupComfort.score,
    ai.locationVibe.score,
    ai.miscellaneous.score,
  ];
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 10) / 10;
}

// ─── Step ────────────────────────────────────────────────────────────────────

type Input = ListingWithScores[];
type Output = (GiteListing & { distanceKm: number; enrichment: GiteEnrichment })[];

export default createStep<Input, Output>("compute-final-rating", "5", (listings) => {
  return listings.map((listing) => {
    const value = scoreValue(listing, listings);
    const finalRating = computeFinalRating(value, listing.algorithmic, listing.ai);

    const enrichment: GiteEnrichment = {
      algorithmic: listing.algorithmic,
      ai: listing.ai,
      value,
      finalRating,
    };

    const { algorithmic: _a, ai: _b, ...rest } = listing;
    return { ...rest, enrichment };
  });
});
