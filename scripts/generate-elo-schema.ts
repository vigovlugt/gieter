#!/usr/bin/env bun
// Generates elo/schema.sql from the current data/results.json top-50,
// then syncs both local and remote D1 DBs (deletes removed listings,
// inserts new ones — preserving ELO scores for listings that stayed).
//
// Run: bun generate-elo-schema

import { $ } from "bun";
import results from "../data/results.json";

const TOP_N = 50;
const top = (results as any[]).slice(0, TOP_N);
const newRefs = top.map((l: any) => l.ref as string);
const newRefSet = new Set(newRefs);

// ── 1. Write schema.sql ───────────────────────────────────────────────────────

const header = `-- D1 schema for gieter-elo
-- Run: bunx wrangler d1 execute gieter-elo --local --file=schema.sql
-- Deploy: bunx wrangler d1 execute gieter-elo --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS listings (
  ref      TEXT PRIMARY KEY,
  elo      REAL NOT NULL DEFAULT 1000,
  wins     INTEGER NOT NULL DEFAULT 0,
  losses   INTEGER NOT NULL DEFAULT 0,
  matches  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  winner_ref  TEXT NOT NULL,
  loser_ref   TEXT NOT NULL,
  voter_name  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed top ${TOP_N} listings at ELO 1000 (idempotent)
`;

const inserts = newRefs
  .map((ref) => `INSERT OR IGNORE INTO listings (ref) VALUES ('${ref}');`)
  .join("\n");

const schemaPath = new URL("../elo/schema.sql", import.meta.url).pathname;
await Bun.write(schemaPath, header + inserts + "\n");
console.log(`Wrote schema.sql with ${newRefs.length} listings.`);

// ── 2. Read current listings from local DB ────────────────────────────────────

async function getCurrentRefs(flag: "--local" | "--remote"): Promise<string[]> {
  const result =
    await $`bunx wrangler d1 execute gieter-elo ${flag} --json --command=${"SELECT ref FROM listings"}`.cwd(
      new URL("../elo", import.meta.url).pathname
    ).quiet();
  const parsed = JSON.parse(result.stdout.toString());
  return (parsed[0]?.results ?? []).map((r: any) => r.ref as string);
}

async function syncDb(flag: "--local" | "--remote") {
  const label = flag === "--local" ? "local" : "remote";
  const currentRefs = await getCurrentRefs(flag);
  const currentRefSet = new Set(currentRefs);

  const toDelete = currentRefs.filter((r) => !newRefSet.has(r));
  const toInsert = newRefs.filter((r) => !currentRefSet.has(r));

  if (toDelete.length === 0 && toInsert.length === 0) {
    console.log(`${label}: already up to date.`);
    return;
  }

  const statements: string[] = [];
  if (toDelete.length > 0) {
    const list = toDelete.map((r) => `'${r}'`).join(",");
    statements.push(`DELETE FROM listings WHERE ref IN (${list})`);
    console.log(`${label}: deleting ${toDelete.length} listings: ${toDelete.join(", ")}`);
  }
  if (toInsert.length > 0) {
    const values = toInsert.map((r) => `('${r}')`).join(",");
    statements.push(`INSERT OR IGNORE INTO listings (ref) VALUES ${values}`);
    console.log(`${label}: inserting ${toInsert.length} listings: ${toInsert.join(", ")}`);
  }

  const sql = statements.join("; ");
  await $`bunx wrangler d1 execute gieter-elo ${flag} --command=${sql}`.cwd(
    new URL("../elo", import.meta.url).pathname
  ).quiet();
  console.log(`${label}: done.`);
}

await syncDb("--local");
await syncDb("--remote");
