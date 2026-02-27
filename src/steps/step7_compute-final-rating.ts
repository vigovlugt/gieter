import { createStep } from "../cache";
import type { AiEnrichment, AlgorithmicEnrichment, GiteEnrichment, GiteListing, RatingComponent } from "../schema";

const GROUP_SIZE = 8;

// ─── Value for money ──────────────────────────────────────────────────────────
//
// sum of the other 5 component scores / price per night total,
// normalised across all listings: best ratio → 9, worst → 2.
//
// Inclusion bonus applied to price before the ratio:
//   all-inclusive → price × 0.85 (effectively cheaper)
//   ≥2 items included → price × 0.93

type ListingWithScores = GiteListing & {
  distanceKm: number;
  algorithmic: AlgorithmicEnrichment;
  ai: AiEnrichment;
};

function qualitySum(algorithmic: AlgorithmicEnrichment, ai: AiEnrichment): number {
  return (
    algorithmic.socialProof.score +
    ai.outdoorChillPotential.score +
    ai.groupComfort.score +
    ai.locationVibe.score +
    ai.miscellaneous.score
  );
}

function effectivePrice(listing: GiteListing): number {
  const price = listing.price.amount;
  if (listing.allInclusive) return price * 0.85;
  if (listing.priceIncludes.length >= 2) return price * 0.93;
  return price;
}

function scoreValue(listing: ListingWithScores, allListings: ListingWithScores[]): RatingComponent {
  const quality = qualitySum(listing.algorithmic, listing.ai);
  const price = effectivePrice(listing);

  const pp = (listing.price.amount / GROUP_SIZE).toFixed(2);
  const inclText = listing.allInclusive
    ? "all-inclusive (price adjusted ×0.85)"
    : listing.priceIncludes.length >= 2
      ? `includes ${listing.priceIncludes.slice(0, 2).join(", ").toLowerCase()} (price adjusted ×0.93)`
      : "few extras included";

  // Listings with no price cannot be value-scored — return neutral
  if (price <= 0) {
    return {
      score: 5,
      reason: `Price unavailable — cannot assess value for money. Quality sum ${quality.toFixed(1)}/50.`,
    };
  }

  const ratio = quality / price;

  // Only include listings with a valid price in the normalisation
  const pricedListings = allListings.filter((l) => effectivePrice(l) > 0);
  const allRatios = pricedListings.map((l) => qualitySum(l.algorithmic, l.ai) / effectivePrice(l));
  const min = Math.min(...allRatios);
  const max = Math.max(...allRatios);

  const score =
    min === max
      ? 5.5
      : Math.round(Math.min(10, Math.max(1, 1 + ((ratio - min) / (max - min)) * 9)) * 10) / 10;

  return {
    score,
    reason: `Quality sum ${quality.toFixed(1)}/50 at €${pp}/person/night — ${inclText}. Ratio ranked across all listings.`,
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

export default createStep<Input, Output>("compute-final-rating", "8", (listings) => {
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
