import { randomSeed } from "./random.js";
import { generate } from "./engine.js";
import { piLength } from "./pi.js";
import { silhouetteSignature } from "./silhouette.js";
export const signatureOf = (record) =>
  record.kind === "pi-path"
    ? "pi-path"
    : silhouetteSignature(record.geometry, record.motifs ?? []);
export class DiscoveryPicker {
  constructor({ entropy = randomSeed, recent = [] } = {}) {
    this.entropy = entropy;
    this.recent = recent.filter((s) => typeof s === "string").slice(-10);
    this.lastAttempts = 0;
    this.exhausted = 0;
  }
  next() {
    let candidate;
    for (let attempt = 0; attempt < 10; attempt++) {
      const seed = this.entropy();
      if (piLength(seed)) continue;
      candidate = generate(seed);
      const signature = signatureOf(candidate);
      this.lastAttempts = attempt + 1;
      if (!this.recent.includes(signature)) {
        this.remember(candidate);
        return candidate;
      }
    }
    if (!candidate)
      throw new Error("Random discovery is unavailable. Try again.");
    this.exhausted++;
    this.remember(candidate);
    return candidate;
  }
  remember(record) {
    const signature = signatureOf(record);
    if (this.recent.at(-1) === signature) return;
    this.recent.push(signature);
    this.recent = this.recent.slice(-10);
  }
  snapshot() {
    return { recent: this.recent };
  }
}
