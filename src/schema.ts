/**
 * Schema for a Gîtes de France listing page.
 *
 * The "épis" (wheat ears, singular: épi) are the official Gîtes de France
 * quality classification symbol — equivalent to stars but specific to this
 * label. 1 épi = basic comfort, up to 5 épis = premium.
 */

export interface GiteReview {
  /** Reviewer's first name */
  author: string;
  /** Stay start date, e.g. "20/12/2025" */
  stayFrom: string;
  /** Stay end date, e.g. "21/12/2025" */
  stayTo: string;
  /** Review headline / title */
  title: string;
  /** Overall rating out of 5 */
  rating: number;
  /** Full review text */
  body: string;
  /** Date the review was posted, e.g. "12/21/2025" */
  postedOn: string;
  /** Breakdown of rating criteria */
  criteria: {
    cleanliness?: number;
    comfort?: number;
    welcome?: number;
    value?: number;
  };
  /** Owner's reply to the review, if any */
  ownerReply?: {
    text: string;
    author: string;
  };
}

export interface GiteHost {
  /** Host's first name */
  name: string;
  /** Languages spoken by the host */
  spokenLanguages: string[];
  /** Year the property was approved by Gîtes de France */
  approvedSince?: number;
}

export interface GiteCapacity {
  /** Total number of guests */
  people: number;
  /** Number of bedrooms */
  bedrooms: number;
  /** Surface area in m² */
  surfaceM2?: number;
  /** Whether WiFi is available */
  wifi: boolean;
  /** Whether pets are accepted */
  petsAccepted: boolean;
  /** Property category, e.g. "Attached House", "Gîte", "Chambre d'hôtes" */
  category?: string;
}

export interface GiteEquipment {
  /** Indoor amenities, e.g. ["TV", "Microwave", "Washing machine shared"] */
  indoor: string[];
  /** Outdoor amenities, e.g. ["Barbecue", "Garden", "Terrace"] */
  outdoor: string[];
  /** Services included, e.g. ["Wifi-Internet", "Sheets provided", "Heating included"] */
  services: string[];
}

export interface GitePrice {
  /** Per-night base rate */
  amount: number;
  /** ISO 4217 currency code, e.g. "EUR" */
  currency: string;
  /** Pricing unit — always "night" */
  per: "night";
}

export interface GiteLocation {
  /** City / commune */
  city: string;
  /** Department, e.g. "Loiret" */
  department: string;
  /** Region, e.g. "Centre-Val de Loire" */
  region: string;
  /** Latitude */
  latitude?: number;
  /** Longitude */
  longitude?: number;
}

/**
 * A single rated component — score computed either algorithmically or by AI.
 */
export interface RatingComponent {
  /** Score from 1–10 */
  score: number;
  /** 1–2 sentence explanation of the score */
  reason: string;
}

/**
 * Algorithmic enrichment computed deterministically from structured listing data.
 * No LLM involved — fully reproducible.
 */
export interface AlgorithmicEnrichment {
  /** Aggregate rating value weighted by review count + per-criterion averages */
  socialProof: RatingComponent;
}

/**
 * AI-generated enrichment requiring natural language understanding of
 * description, summary, and equipment free text.
 */
export interface AiEnrichment {
  /** Garden/terrace/pool quality, summer outdoor lounging potential for a group */
  outdoorChillPotential: RatingComponent;
  /** Bedroom layout quality, bathroom sufficiency, common space feel for 8 people */
  groupComfort: RatingComponent;
  /** Rural vs suburban character, natural surroundings, holiday destination feel */
  locationVibe: RatingComponent;
  /**
   * Anything notable not captured by the other components — unique features,
   * red flags, standout bonuses. Score of 5 means nothing special to report.
   * Can be positive (e.g. private pool, vineyard views) or negative (e.g. owner
   * lives on-site and may restrict noise).
   */
  miscellaneous: RatingComponent;
}

/**
 * Full enrichment output: both algorithmic and AI components plus the final
 * weighted-average rating (all 6 components weighted equally at 1/6 each).
 */
export interface GiteEnrichment {
  algorithmic: AlgorithmicEnrichment;
  ai: AiEnrichment;
  /** Value for money: quality (avg of other 5 components) / price, normalised 2–9 */
  value: RatingComponent;
  /** Final rating 1–10: equal-weighted average of all 6 component scores */
  finalRating: number;
}

export interface GiteListing {
  /** Internal reference code, e.g. "H45H026322" */
  ref: string;
  /** Full listing title, e.g. '"Chambre 1", Ferme de la Volière' */
  title: string;
  /** Accommodation type, e.g. "Guest house", "Holiday rental" */
  type: string;
  /**
   * Gîtes de France quality rating expressed in épis (wheat ears).
   * Range: 1–5. The épi is the site's own classification symbol,
   * analogous to hotel stars but specific to this label.
   */
  quality: number;
  /** Short tagline / intro paragraph shown above the description section */
  summary?: string;
  /** Full description text (layout, amenities detail, etc.) */
  description?: string;
  /** Canonical URL of the listing */
  url: string;
  /** URLs of listing photos */
  photos: string[];
  /** Location details */
  location: GiteLocation;
  /** Capacity and physical property details */
  capacity: GiteCapacity;
  /** Equipment / amenities */
  equipment: GiteEquipment;
  /** List of items included in the price, e.g. "Bed linen", "Heating" */
  priceIncludes: string[];
  /** Starting / base price */
  price: GitePrice;
  /** Whether the listing is "All Inclusive" */
  allInclusive: boolean;
  /** Aggregate guest rating */
  aggregateRating: {
    /** Average score out of 5 */
    value: number;
    /** Number of reviews */
    count: number;
  };
  /** Individual guest reviews */
  reviews: GiteReview[];
  /** Host / owner information */
  host: GiteHost;
  /** Accommodation type announcement: "individual" or "professional" */
  advertType?: "individual" | "professional";
}
