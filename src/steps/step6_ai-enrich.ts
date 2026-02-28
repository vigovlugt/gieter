import { createStep, runStep } from "../cache";
import type { AiEnrichment, AlgorithmicEnrichment, GiteListing, RatingComponent } from "../schema";

const OPENROUTER_API_KEY = process.env["GIETER_OPENROUTER_API_KEY"];
if (!OPENROUTER_API_KEY) throw new Error("GIETER_OPENROUTER_API_KEY is not set");

const MODEL = "google/gemini-3-flash-preview";

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are evaluating holiday rental listings for a group of 8 students (20s) planning a relaxing week in France in late July. Their goal is to chill: sunbathe, sit outside, enjoy nature, cook together, and have space to hang out as a group.

You will be given a listing's details and must rate FOUR components on a scale of 1–10 and provide a 1–2 sentence reason for each. Be strict with the criteria.

The four components are:

1. outdoorChillPotential (1–10)
   Does this place excel for outdoor relaxation in summer? Look for: pool, large private garden, quality terrace, deckchairs, barbecue, countryside setting, shade, views. Penalise heavily: small or shared outdoor space, urban location. Hard caps on pool:
   - No pool at all: score 5 maximum.
   - Pool present but explicitly shared (with other guests/properties): score 6 maximum.
   - Pool present and private, or pool type unspecified (assume private): no cap from this rule.
   No garden at all scores 3 or below.

2. groupComfort (1–10)
   How comfortable is the layout for 8 people sharing for a week? Look for: enough double beds (not just bunks), multiple bathrooms, a spacious communal living area, good kitchen for cooking together. Penalise: split across separate units, many bunk beds, single bathroom, cramped common space.

3. locationVibe (1–10)
   Is the property's IMMEDIATE setting a proper holiday environment? You are scoring the property's surroundings, NOT the broader region or nearby attractions.
   Look for: directly in nature (forest, fields, river, sea, vineyard), private or rural setting, no neighbours visible, countryside or coastal isolation.
    Penalise very heavily: in a village centre or on a village street (even a charming one), in a town, suburban sprawl, industrial areas, commuter belt, or anywhere neighbours are visible or audible. Being "near" the sea or a forest is not enough — the property itself must feel like it is IN nature or in an isolated rural setting.
    A property in the middle of a village scores 3–4 at most, even if the village is picturesque or close to the coast. Any mention of neighbours nearby, shared walls, or overlooked outdoor space is an immediate heavy penalty.

4. miscellaneous (1–10, default 5)
   Anything notable NOT already captured by the above three components. Use 5 if there is nothing special to report. Go above 5 for standout bonuses (e.g. private pool on top of garden, vineyard on-site, exceptional views, spa included, unique architecture). Go below 5 for red flags (e.g. owner lives on-site and may restrict noise/late nights, parties explicitly forbidden, shared facilities with other guests, unusual access issues). Read the reviews carefully for red flags that the description glosses over.

Return ONLY a JSON object in this exact shape, with no markdown fences or extra text:
{
  "outdoorChillPotential": { "score": <number 1-10>, "reason": "<1-2 sentences>" },
  "groupComfort": { "score": <number 1-10>, "reason": "<1-2 sentences>" },
  "locationVibe": { "score": <number 1-10>, "reason": "<1-2 sentences>" },
  "miscellaneous": { "score": <number 1-10>, "reason": "<1-2 sentences>" }
}`;

function buildListingPrompt(listing: GiteListing & { distanceKm: number }): string {
  // Strip photos — waste of tokens. Reviews are kept: their free text is the
  // strongest signal for locationVibe, outdoorChillPotential, and miscellaneous red flags.
  const condensed = {
    title: listing.title,
    type: listing.type,
    summary: listing.summary,
    description: listing.description,
    location: listing.location,
    capacity: listing.capacity,
    equipment: listing.equipment,
    priceIncludes: listing.priceIncludes,
    distanceKm: listing.distanceKm,
    reviews: listing.reviews.map((r) => ({
      rating: r.rating,
      title: r.title,
      body: r.body,
      criteria: r.criteria,
    })),
  };
  return JSON.stringify(condensed, null, 2);
}

// ─── API call ─────────────────────────────────────────────────────────────────

const AI_COMPONENTS = ["outdoorChillPotential", "groupComfort", "locationVibe", "miscellaneous"] as const;
const MAX_ATTEMPTS = 3;

async function callOpenRouter(listingPrompt: string, attempt = 1): Promise<AiEnrichment> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: listingPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${text}`);
  }

  const result = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = result.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenRouter");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse AI JSON response: ${content}`);
  }

  // Validate schema — retry on invalid shape (up to MAX_ATTEMPTS)
  const errors: string[] = [];
  for (const key of AI_COMPONENTS) {
    const comp = parsed[key] as Record<string, unknown> | undefined;
    if (typeof comp?.score !== "number" || typeof comp?.reason !== "string") {
      errors.push(`'${key}': ${JSON.stringify(comp)}`);
    }
  }

  if (errors.length > 0) {
    if (attempt < MAX_ATTEMPTS) {
      process.stderr.write(`  [ai-enrich] Schema invalid (attempt ${attempt}/${MAX_ATTEMPTS}), retrying... ${errors.join(", ")}\n`);
      return callOpenRouter(listingPrompt, attempt + 1);
    }
    throw new Error(`AI response failed schema validation after ${MAX_ATTEMPTS} attempts: ${errors.join(", ")}`);
  }

  // Clamp scores now that we know the shape is valid
  for (const key of AI_COMPONENTS) {
    const comp = parsed[key] as RatingComponent;
    comp.score = Math.round(Math.min(10, Math.max(1, comp.score)) * 10) / 10;
  }

  return parsed as unknown as AiEnrichment;
}

// ─── Per-listing cached step ──────────────────────────────────────────────────
//
// Each listing gets its own createStep keyed by ref + version.
// This means a single failed/changed listing doesn't invalidate the others,
// and re-runs only call the API for listings not yet cached.

type ListingInput = GiteListing & { distanceKm: number; algorithmic: AlgorithmicEnrichment };
type ListingOutput = ListingInput & { ai: AiEnrichment };

async function enrichListing(listing: ListingInput): Promise<ListingOutput> {
  const step = createStep<ListingInput, ListingOutput>(
    `ai-enrich-${listing.ref}`,
    "5",
    async (l) => {
      process.stderr.write(`[ai-enrich] Rating "${l.title}" (${l.ref})...\n`);
      const ai = await callOpenRouter(buildListingPrompt(l));
      return { ...l, ai };
    }
  );

  return runStep(step, listing);
}

// ─── Step ────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 16;

type Input = ListingInput[];
type Output = ListingOutput[];

export default createStep<Input, Output>("ai-enrich", "6", async (listings) => {
  const results: Output = [];

  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE);
    process.stderr.write(`[ai-enrich] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(listings.length / BATCH_SIZE)} (${batch.length} listings)...\n`);
    const batchResults = await Promise.all(batch.map(enrichListing));
    results.push(...batchResults);
  }

  return results;
});
