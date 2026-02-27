import { createStep } from "../cache";
import type { AlgorithmicEnrichment, GiteListing, RatingComponent } from "../schema";

// 8 students travelling together
const GROUP_SIZE = 8;

// ─── Value ──────────────────────────────────────────────────────────────────
//
// Price per person per night, normalized within the same épis quality tier.
// A listing is compared only against others at the same quality level so that
// a cheap 3-épi isn't unfairly penalized against 1-épi bargains.
//
// Within each tier: cheapest → 10, most expensive → 1, linear in between.
// If a tier has only one listing it scores 7 (slightly above neutral — being
// the sole option at that quality is mildly positive).
// Bonus: +1.0 if all-inclusive, +0.5 if priceIncludes has ≥3 items, +0.25 if ≥1.

interface PriceRange {
  min: number;
  max: number;
}

function buildQualityPriceRanges(listings: GiteListing[]): Map<number, PriceRange> {
  const byQuality = new Map<number, number[]>();
  for (const l of listings) {
    const pp = l.price.amount / GROUP_SIZE;
    const tier = l.quality;
    if (!byQuality.has(tier)) byQuality.set(tier, []);
    byQuality.get(tier)!.push(pp);
  }
  const ranges = new Map<number, PriceRange>();
  for (const [tier, prices] of byQuality) {
    ranges.set(tier, { min: Math.min(...prices), max: Math.max(...prices) });
  }
  return ranges;
}

function scoreValue(listing: GiteListing, ranges: Map<number, PriceRange>): RatingComponent {
  const perPersonPerNight = listing.price.amount / GROUP_SIZE;
  const range = ranges.get(listing.quality);

  let baseScore: number;
  if (!range || range.min === range.max) {
    // Only one listing in this tier — reward it mildly
    baseScore = 7;
  } else {
    // Linear: min → 10, max → 1
    baseScore = 10 - ((perPersonPerNight - range.min) / (range.max - range.min)) * 9;
  }

  const inclusionBonus = listing.allInclusive
    ? 1.0
    : listing.priceIncludes.length >= 3
      ? 0.5
      : listing.priceIncludes.length >= 1
        ? 0.25
        : 0;

  const score = Math.round(Math.min(10, Math.max(1, baseScore + inclusionBonus)) * 10) / 10;

  const pp = perPersonPerNight.toFixed(2);
  const tierText = listing.quality > 0 ? `${listing.quality}-épi tier` : "unrated tier";
  const inclText = listing.allInclusive
    ? "all-inclusive"
    : listing.priceIncludes.length > 0
      ? `includes ${listing.priceIncludes.slice(0, 2).join(", ").toLowerCase()}`
      : "few extras included";

  return {
    score,
    reason: `€${pp}/person/night — ${inclText}. Ranked within ${tierText} (range €${(range?.min ?? perPersonPerNight).toFixed(2)}–€${(range?.max ?? perPersonPerNight).toFixed(2)}/pp).`,
  };
}

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

// ─── Practical Amenities ─────────────────────────────────────────────────────
//
// Unweighted checklist for 8 people staying a week.
// Each amenity contributes equally. Score = (hits / total) * 10, then space
// adds up to 1 bonus point. Clamped to 1–10.
//
// Checklist items:
//   WiFi, Washing machine, Dishwasher, Parking, Oven/hob,
//   Barbecue, Freezer, Terrace or garden

const AMENITY_CHECKLIST: Array<{ label: string; check: (l: GiteListing) => boolean }> = [
  {
    label: "WiFi",
    check: (l) => l.capacity.wifi || l.equipment.services.some((s) => /wifi/i.test(s)),
  },
  {
    label: "Washing machine",
    check: (l) => l.equipment.indoor.some((e) => /washing/i.test(e)),
  },
  {
    label: "Dishwasher",
    check: (l) => l.equipment.indoor.some((e) => /dish/i.test(e)),
  },
  {
    label: "Parking",
    check: (l) => l.equipment.outdoor.some((e) => /parking/i.test(e)),
  },
  {
    label: "Oven or hob",
    check: (l) =>
      /oven|hob|stove|induction|cuisini/i.test(l.description ?? "") ||
      /oven|hob|stove|induction/i.test(l.summary ?? ""),
  },
  {
    label: "Barbecue",
    check: (l) => l.equipment.outdoor.some((e) => /barbecue|grill/i.test(e)),
  },
  {
    label: "Freezer",
    check: (l) => l.equipment.indoor.some((e) => /freez|congél/i.test(e)),
  },
  {
    label: "Terrace or garden",
    check: (l) =>
      l.equipment.outdoor.some((e) => /terrace|garden|terrasse|jardin/i.test(e)),
  },
];

function scoreSpaceBonus(listing: GiteListing): { bonus: number; label: string } {
  const m2 = listing.capacity.surfaceM2;
  if (m2 == null) return { bonus: 0, label: "unknown floor area" };
  const perPerson = m2 / GROUP_SIZE;
  if (perPerson >= 20) return { bonus: 1.0, label: `${m2} m² (${perPerson.toFixed(0)} m²/person — spacious)` };
  if (perPerson >= 12) return { bonus: 0.5, label: `${m2} m² (${perPerson.toFixed(0)} m²/person — adequate)` };
  return { bonus: 0, label: `${m2} m² (${perPerson.toFixed(0)} m²/person — cramped)` };
}

function scorePracticalAmenities(listing: GiteListing): RatingComponent {
  const hits: string[] = [];
  const misses: string[] = [];

  for (const amenity of AMENITY_CHECKLIST) {
    if (amenity.check(listing)) {
      hits.push(amenity.label);
    } else {
      misses.push(amenity.label);
    }
  }

  const space = scoreSpaceBonus(listing);
  const base = (hits.length / AMENITY_CHECKLIST.length) * 10;
  const score = Math.round(Math.min(10, Math.max(1, base + space.bonus)) * 10) / 10;

  const hitText = hits.length > 0 ? `Has: ${hits.join(", ")}.` : "Missing most amenities.";
  const missText = misses.length > 0 ? ` Missing: ${misses.join(", ")}.` : "";

  return {
    score,
    reason: `${hitText}${missText} ${space.label}.`,
  };
}

// ─── Step ────────────────────────────────────────────────────────────────────

type Input = (GiteListing & { distanceKm: number })[];
type Output = (GiteListing & { distanceKm: number; algorithmic: AlgorithmicEnrichment })[];

export default createStep<Input, Output>("algorithmic-enrich", "2", (listings) => {
  const qualityPriceRanges = buildQualityPriceRanges(listings);

  return listings.map((listing) => {
    const value = scoreValue(listing, qualityPriceRanges);
    const socialProof = scoreSocialProof(listing);
    const practicalAmenities = scorePracticalAmenities(listing);

    const algorithmic: AlgorithmicEnrichment = {
      value,
      socialProof,
      practicalAmenities,
    };

    return { ...listing, algorithmic };
  });
});
