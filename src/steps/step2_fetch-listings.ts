import { createStep, runStep } from "../cache";
import { parseGiteListing } from "../parse";
import type { GiteListing } from "../schema";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Per-URL slug ─────────────────────────────────────────────────────────────
// Use the last two path segments as a short readable key, e.g.
// "https://www.gites-de-france.com/en/normandie/manche/le-truc-50G1234"
// → "le-truc-50G1234"

function urlSlug(url: string): string {
  const parts = url.replace(/\/$/, "").split("/");
  return parts[parts.length - 1] ?? Bun.hash(url).toString();
}

// ─── Per-listing cached step ──────────────────────────────────────────────────

async function fetchListing(url: string): Promise<GiteListing | null> {
  const slug = urlSlug(url);
  const step = createStep<string, GiteListing | null>(
    `fetch-listing-${slug}`,
    "1",
    async (u) => {
      process.stderr.write(`[fetch-listing] ${u}\n`);
      const res = await fetch(u, { headers: HEADERS });
      if (!res.ok) {
        process.stderr.write(`  ERROR: HTTP ${res.status}\n`);
        return null;
      }
      try {
        return parseGiteListing(await res.text());
      } catch (err) {
        process.stderr.write(`  ERROR: parse failed: ${err}\n`);
        return null;
      }
    }
  );

  return runStep(step, url);
}

// ─── Outer step ───────────────────────────────────────────────────────────────

export default createStep<string[], GiteListing[]>("fetch-listings", "2", async (urls) => {
  const listings: GiteListing[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    process.stderr.write(`[${i + 1}/${urls.length}] ${url}\n`);
    const listing = await fetchListing(url);
    if (listing) listings.push(listing);
  }

  return listings;
});
