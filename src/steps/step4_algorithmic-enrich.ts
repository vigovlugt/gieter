import { createStep } from "../cache";
import type { AlgorithmicEnrichment, GiteListing, RatingComponent } from "../schema";

// 8 students travelling together
const GROUP_SIZE = 8;

// ─── Social Proof ────────────────────────────────────────────────────────────
//
// Base: aggregate rating value (already out of 5 → scale to 10).
// Confidence damping: few reviews shrink the score toward a neutral 5.
//   - 0 reviews → 5.0 (neutral, no information)
//   - 1 review  → 70% actual, 30% neutral
//   - 2 reviews → 85% actual, 15% neutral
//   - 3+ reviews → 95% actual, 5% neutral
//
// Bonus: up to +0.5 pts if per-criterion averages are uniformly high (comfort,
//        cleanliness both ≥ 4.5).

function scoreReviewCriteria(listing: GiteListing): { comfort: number; cleanliness: number } | null {
  const reviews = listing.reviews.filter(
    (r) => r.criteria.comfort != null && r.criteria.cleanliness != null
  );
  if (reviews.length === 0) return null;
  const comfort = reviews.reduce((s, r) => s + (r.criteria.comfort ?? 0), 0) / reviews.length;
  const cleanliness = reviews.reduce((s, r) => s + (r.criteria.cleanliness ?? 0), 0) / reviews.length;
  return { comfort, cleanliness };
}

function scoreConfidenceWeight(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 0.7;
  if (count === 2) return 0.85;
  return 0.95;
}

function scoreSocialProof(listing: GiteListing): RatingComponent {
  const { value, count } = listing.aggregateRating;

  if (count === 0) {
    return {
      score: 5,
      reason: "No reviews yet — no social proof available.",
    };
  }

  const NEUTRAL = 5;
  const weight = scoreConfidenceWeight(count);
  const rawBase = (value / 5) * 10;
  const damped = weight * rawBase + (1 - weight) * NEUTRAL;

  const criteria = scoreReviewCriteria(listing);
  const criteriaBonus =
    criteria && criteria.comfort >= 4.5 && criteria.cleanliness >= 4.5 ? 0.5 : 0;

  const score = Math.round(Math.min(10, Math.max(1, damped + criteriaBonus)) * 10) / 10;

  const confidence = count >= 3 ? "solid" : count === 2 ? "limited" : "very limited";
  const criteriaText =
    criteria
      ? ` Comfort avg ${criteria.comfort.toFixed(1)}/5, cleanliness avg ${criteria.cleanliness.toFixed(1)}/5.`
      : "";

  return {
    score,
    reason: `${value}/5 from ${count} review${count !== 1 ? "s" : ""} (${confidence} sample).${criteriaText}`,
  };
}

// ─── Step ────────────────────────────────────────────────────────────────────

type Input = (GiteListing & { distanceKm: number })[];
type Output = (GiteListing & { distanceKm: number; algorithmic: AlgorithmicEnrichment })[];

export default createStep<Input, Output>("algorithmic-enrich", "5", (listings) => {
  return listings.map((listing) => {
    const socialProof = scoreSocialProof(listing);

    const algorithmic: AlgorithmicEnrichment = {
      socialProof,
    };

    return { ...listing, algorithmic };
  });
});
