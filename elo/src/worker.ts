import { calculateElo } from "./elo";
import resultsJson from "../../data/results.json";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Env {
  DB: D1Database;
}

interface ListingRow {
  ref: string;
  elo: number;
  wins: number;
  losses: number;
  matches: number;
}

interface VoteRow {
  id: number;
  winner_ref: string;
  loser_ref: string;
  voter_name: string;
  created_at: string;
}

// ── Static listing data (top 50 by finalRating) ──────────────────────────────

const RAW_LISTINGS = (resultsJson as any[]).slice(0, 50).map((l: any) => ({
  ref: l.ref as string,
  title: l.title as string,
  url: l.url as string,
  quality: l.quality as number,
  summary: (l.summary ?? "") as string,
  description: (l.description ?? "") as string,
  location: l.location as {
    city: string;
    department: string;
    region: string;
    latitude: number;
    longitude: number;
  },
  capacity: l.capacity as {
    people: number;
    bedrooms: number;
    surfaceM2: number | null;
    wifi: boolean;
    petsAccepted: boolean;
  },
  price: l.price as { amount: number; currency: string; per: string },
  allInclusive: l.allInclusive as boolean,
  photos: (l.photos as string[]).slice(0, 8),
  equipment: l.equipment as {
    indoor: string[];
    outdoor: string[];
    services: string[];
  },
  aggregateRating: l.aggregateRating as { value: number; count: number },
  reviews: ((l.reviews ?? []) as any[]).slice(0, 3).map((r: any) => ({
    author: r.author as string,
    stayFrom: r.stayFrom as string,
    stayTo: r.stayTo as string,
    title: r.title as string,
    rating: r.rating as number,
    body: r.body as string,
    ownerReply: r.ownerReply
      ? { author: r.ownerReply.author as string, text: r.ownerReply.text as string }
      : null,
  })),
  distanceKm: Math.round(l.distanceKm as number),
  finalRating: l.enrichment.finalRating as number,
  enrichment: {
    algorithmic: l.enrichment.algorithmic as { socialProof: { score: number; reason: string } },
    ai: l.enrichment.ai as {
      outdoorChillPotential: { score: number; reason: string };
      groupComfort: { score: number; reason: string };
      locationVibe: { score: number; reason: string };
      miscellaneous: { score: number; reason: string };
    },
    value: l.enrichment.value as { score: number; reason: string },
    finalRating: l.enrichment.finalRating as number,
  },
}));

const LISTINGS_BY_REF = new Map(RAW_LISTINGS.map((l) => [l.ref, l]));

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

// Pick a random pair using a two-phase strategy:
//   Phase 1 (freshness): if any listing has < 2 matches, restrict the pool to
//     only those under-played listings so every house gets seen at least twice.
//   Phase 2 (rank-based): once all listings have >= 2 matches, weight by ELO rank:
//     top 10%  → 5x, top 11-25% → 3x, bottom 75% → 1x.
async function randomPair(db: D1Database): Promise<[ListingRow, ListingRow] | null> {
  const { results } = await db
    .prepare("SELECT ref, elo, wins, losses, matches FROM listings ORDER BY elo DESC")
    .all<ListingRow>();

  if (!results || results.length < 2) return null;

  const underplayed = results.filter((r) => r.matches < 2);
  const pool = underplayed.length >= 2 ? underplayed : results;

  let weights: number[];
  if (underplayed.length >= 2) {
    // Phase 1: equal weight within the under-played pool
    weights = pool.map(() => 1);
  } else {
    // Phase 2: rank-based weights (results already sorted by ELO desc)
    const n = pool.length;
    weights = pool.map((_, i) => {
      const pct = i / n; // 0 = highest ELO
      if (pct < 0.10) return 5;
      if (pct < 0.25) return 3;
      return 1;
    });
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);

  function pickOne(exclude?: string): ListingRow | null {
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < pool.length; i++) {
      const row = pool[i]!;
      if (row.ref === exclude) continue;
      rand -= weights[i]!;
      if (rand <= 0) return row;
    }
    // Fallback: pick first that isn't excluded
    return pool.find((r) => r.ref !== exclude) ?? null;
  }

  const a = pickOne();
  if (!a) return null;
  const b = pickOne(a.ref);
  if (!b) return null;
  return [a, b];
}

function attachStatic(row: ListingRow) {
  const static_ = LISTINGS_BY_REF.get(row.ref);
  return { ...row, listing: static_ ?? null };
}

// ── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // GET /api/matchup
    if (method === "GET" && path === "/api/matchup") {
      const pair = await randomPair(env.DB);
      if (!pair) return err("Not enough listings", 500);
      const [a, b] = pair;
      return json({ a: attachStatic(a), b: attachStatic(b) });
    }

    // POST /api/vote  { winner: ref, loser: ref, voter: name }
    if (method === "POST" && path === "/api/vote") {
      let body: { winner?: string; loser?: string; voter?: string };
      try {
        body = await request.json();
      } catch {
        return err("Invalid JSON");
      }
      const { winner, loser, voter } = body;
      if (!winner || !loser || !voter) return err("Missing winner, loser, or voter");
      if (winner === loser) return err("winner and loser must differ");
      if (!LISTINGS_BY_REF.has(winner)) return err("Unknown winner ref");
      if (!LISTINGS_BY_REF.has(loser)) return err("Unknown loser ref");

      const voterName = voter.trim().slice(0, 64);
      if (!voterName) return err("voter name is empty");

      // Fetch current ELOs
      const rows = await env.DB
        .prepare("SELECT ref, elo, wins, losses, matches FROM listings WHERE ref IN (?, ?)")
        .bind(winner, loser)
        .all<ListingRow>();

      const winnerRow = rows.results?.find((r) => r.ref === winner);
      const loserRow = rows.results?.find((r) => r.ref === loser);
      if (!winnerRow || !loserRow) return err("Listing not found in DB", 500);

      const { newWinnerElo, newLoserElo } = calculateElo(winnerRow.elo, loserRow.elo);

      await env.DB.batch([
        env.DB.prepare(
          "UPDATE listings SET elo=?, wins=wins+1, matches=matches+1 WHERE ref=?"
        ).bind(Math.round(newWinnerElo * 100) / 100, winner),
        env.DB.prepare(
          "UPDATE listings SET elo=?, losses=losses+1, matches=matches+1 WHERE ref=?"
        ).bind(Math.round(newLoserElo * 100) / 100, loser),
        env.DB.prepare(
          "INSERT INTO votes (winner_ref, loser_ref, voter_name) VALUES (?, ?, ?)"
        ).bind(winner, loser, voterName),
      ]);

      const countRow = await env.DB
        .prepare("SELECT COUNT(*) as total FROM votes")
        .first<{ total: number }>();

      return json({ ok: true, newWinnerElo, newLoserElo, totalVotes: countRow?.total ?? 0 });
    }

    // GET /api/leaderboard
    if (method === "GET" && path === "/api/leaderboard") {
      const { results } = await env.DB
        .prepare("SELECT ref, elo, wins, losses, matches FROM listings ORDER BY elo DESC")
        .all<ListingRow>();

      const board = (results ?? []).map((row, i) => ({
        rank: i + 1,
        ...attachStatic(row),
      }));

      // Total vote count
      const countRow = await env.DB
        .prepare("SELECT COUNT(*) as total FROM votes")
        .first<{ total: number }>();

      return json({ totalVotes: countRow?.total ?? 0, leaderboard: board });
    }

    // GET /api/votes  — full vote history for admin view
    if (method === "GET" && path === "/api/votes") {
      const { results } = await env.DB
        .prepare("SELECT id, winner_ref, loser_ref, voter_name, created_at FROM votes ORDER BY id DESC LIMIT 500")
        .all<VoteRow>();

      const enriched = (results ?? []).map((v) => ({
        ...v,
        winner_title: LISTINGS_BY_REF.get(v.winner_ref)?.title ?? v.winner_ref,
        loser_title: LISTINGS_BY_REF.get(v.loser_ref)?.title ?? v.loser_ref,
      }));

      return json({ votes: enriched });
    }

    // POST /api/reset  — wipe all votes and reset ELOs
    if (method === "POST" && path === "/api/reset") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM votes"),
        env.DB.prepare("UPDATE listings SET elo=1000, wins=0, losses=0, matches=0"),
      ]);
      return json({ ok: true });
    }

    // Fallthrough — let the assets binding handle static files
    return new Response("Not found", { status: 404 });
  },
};
