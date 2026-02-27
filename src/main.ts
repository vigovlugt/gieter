import { runStep } from "./cache";
import fetchUrls from "./steps/step1_fetch-urls";
import fetchListings from "./steps/step2_fetch-listings";
import filterDistance from "./steps/step3_filter-distance";
import algorithmicEnrich from "./steps/step4_algorithmic-enrich";
import filterAlgorithmic from "./steps/step5_filter-algorithmic";
import aiEnrich from "./steps/step6_ai-enrich";
import computeFinalRating from "./steps/step7_compute-final-rating";
import generateSite from "./steps/step8_generate-site";

const urls = await runStep(fetchUrls, undefined);
const listings = await runStep(fetchListings, urls);
const filtered = await runStep(filterDistance, listings);
const withAlgorithmic = await runStep(algorithmicEnrich, filtered);
const filteredAlgorithmic = await runStep(filterAlgorithmic, withAlgorithmic);
const withAi = await runStep(aiEnrich, filteredAlgorithmic);
const enriched = await runStep(computeFinalRating, withAi);

// Sort by final rating descending
const results = enriched.sort((a, b) => b.enrichment.finalRating - a.enrichment.finalRating);

await Bun.write("data/results.json", JSON.stringify(results, null, 2));
console.log(`Wrote ${results.length} results to data/results.json`);

await runStep(generateSite, results);
