import { file, write } from "bun";
import { mkdir } from "node:fs/promises";

const CACHE_DIR = "./.cache";
await mkdir(CACHE_DIR, { recursive: true });

export interface Step<I, O> {
  name: string;
  version: string;
  run: (input: I) => Promise<O> | O;
}

export function createStep<I, O>(name: string, version: string, run: (input: I) => Promise<O> | O): Step<I, O> {
  return { name, version, run };
}

/**
 * Runs a pipeline step with incremental caching.
 * The cache key is derived from the step name, version string, and input data.
 * Bump `version` in a step to invalidate its cache.
 */
export async function runStep<I, O>(step: Step<I, O>, input: I): Promise<O> {
  const inputString = JSON.stringify(input);
  const fingerprint = Bun.hash(inputString + step.version).toString();
  const cachePath = `${CACHE_DIR}/${step.name}_${fingerprint}.json`;
  const cacheFile = file(cachePath);

  if (await cacheFile.exists()) {
    console.log(`[cache hit] ${step.name}`);
    return cacheFile.json() as Promise<O>;
  }

  console.log(`[computing] ${step.name}...`);
  const result = await step.run(input);
  await write(cachePath, JSON.stringify(result));
  return result;
}
