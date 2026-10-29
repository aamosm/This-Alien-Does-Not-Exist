import { generate } from "./engine.js";
import { randomSeed } from "./random.js";
import { piLength } from "./pi.js";
import { signatureOf } from "./discovery.js";

export function randomOpponent(
  left,
  { recent = [], entropy = randomSeed } = {},
) {
  const excluded = new Set([left.identity.seed, ...recent]);
  const silhouette = signatureOf(left);
  let fallback = null;
  for (let i = 0; i < 24; i++) {
    const seed = String(entropy());
    if (excluded.has(seed) || piLength(seed)) continue;
    const record = generate(seed);
    if (record.kind === "pi-path" || excluded.has(record.identity.seed))
      continue;
    fallback ??= record;
    if (signatureOf(record) !== silhouette) return record;
  }
  if (fallback) return fallback;
  throw new Error(
    "Could not find a new opponent. Try again or enter a creature seed.",
  );
}

export function freshCode() {
  return randomSeed();
}
