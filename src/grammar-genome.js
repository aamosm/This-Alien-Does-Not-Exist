import { normalizeSeed, P_D, piLength } from "./pi.js";
export const GENES = Object.freeze([
  "body",
  "head",
  "limbSet",
  "surface",
  "symmetry",
  "limbShape",
  "segments",
  "eyeCount",
  "eyeStyle",
  "mouth",
  "pupil",
  "wings",
  "horns",
  "tail",
  "tentacles",
  "antennae",
  "crest",
  "extraLimbs",
  "iconCount",
  "motif1",
  "motif2",
  "motifCount",
  "length",
  "width",
  "taper",
  "lobes",
  "bend",
  "headSize",
  "headWidth",
  "neck",
  "limbLength",
  "limbWidth",
  "pose",
  "phase",
  "asymmetry",
  "tailLength",
  "eyeSize",
  "eyeVariance",
  "iris",
  "lid",
  "hue",
  "chroma",
  "lightness",
  "contrast",
  "patternScale",
  "gravity",
  "light",
  "moisture",
  "cover",
  "temperature",
  "resources",
  "diet",
  "activity",
  "strategy",
  "exploration",
  "caution",
  "sociality",
  "frame",
  "offsetX",
  "offsetY",
  "detail",
]);
export const LEVELS = 65536,
  BITS = BigInt(GENES.length * 16),
  SPACE = 1n << BITS,
  G_MASK = SPACE - 1n;
const A =
  BigInt("0x" + "bf58476d1ce4e5b9".repeat(Math.ceil(Number(BITS) / 64))) &
  G_MASK;
const B =
  BigInt("0x" + "94d049bb133111eb".repeat(Math.ceil(Number(BITS) / 64))) &
  G_MASK;
function inverseOdd(a) {
  let x = 1n;
  for (let n = 1; n < Number(BITS); n *= 2) x = (x * (2n - a * x)) & G_MASK;
  return x;
}
const IA = inverseOdd(A),
  IB = inverseOdd(B),
  S1 = BITS / 3n,
  S2 = BITS / 2n - 3n,
  S3 = BITS / 3n + 5n;
function unxor(x, s) {
  let out = x;
  for (let n = s; n < BITS; n += s) out ^= x >> n;
  return out & G_MASK;
}
export function permute(x) {
  x &= G_MASK;
  x = ((x ^ (x >> S1)) * A) & G_MASK;
  x = ((x ^ (x >> S2)) * B) & G_MASK;
  return (x ^ (x >> S3)) & G_MASK;
}
export function unpermute(x) {
  x = unxor(x, S3);
  x = (x * IB) & G_MASK;
  x = unxor(x, S2);
  x = (x * IA) & G_MASK;
  return unxor(x, S1);
}
export function decode(seed) {
  const n = BigInt(normalizeSeed(seed)),
    quotient = n / SPACE;
  let code = permute(n % SPACE);
  const digits = {};
  for (const key of GENES) {
    digits[key] = Number(code & 65535n);
    code >>= 16n;
  }
  return { digits, quotient: quotient.toString() };
}
export function encode(genome) {
  let code = 0n;
  for (let i = GENES.length - 1; i >= 0; i--) {
    const d = genome.digits[GENES[i]];
    if (!Number.isInteger(d) || d < 0 || d >= LEVELS)
      throw new TypeError("Invalid genome digit: " + GENES[i]);
    code = (code << 16n) | BigInt(d);
  }
  const q = BigInt(genome.quotient ?? 0);
  if (q < 0n) throw new RangeError("Invalid genome quotient.");
  const n = q * SPACE + unpermute(code);
  if (n > P_D) throw new RangeError("Encoded genome exceeds the seed limit.");
  return n.toString();
}
export const unit = (g, k) => g.digits[k] / 65535;
export function setUnit(g, k, u) {
  if (!GENES.includes(k) || !Number.isFinite(u))
    throw new TypeError("Invalid input: " + k);
  g.digits[k] = Math.max(0, Math.min(65535, Math.round(u * 65535)));
}
export function ordinarySeed(genome) {
  let seed = encode(genome);
  if (piLength(seed)) {
    genome = {
      ...genome,
      quotient: (BigInt(genome.quotient ?? 0) + 1n).toString(),
    };
    seed = encode(genome);
  }
  return seed;
}
export function tableChoice(digit, table) {
  const total = table.reduce((s, [w]) => s + w, 0);
  let x = ((digit + 0.5) / LEVELS) * total;
  for (const [weight, value] of table) {
    x -= weight;
    if (x < 0) return value;
  }
  return table.at(-1)[1];
}
export function choiceInterval(value, table) {
  const total = table.reduce((s, [w]) => s + w, 0);
  let start = 0;
  for (const [w, v] of table) {
    if (v === value)
      return [
        Math.max(0, Math.ceil((start / total) * LEVELS - 0.5)),
        Math.min(65535, Math.ceil(((start + w) / total) * LEVELS - 0.5) - 1),
      ];
    start += w;
  }
  return null;
}
export function setChoice(g, key, value, table) {
  const range = choiceInterval(value, table);
  if (!range || range[0] > range[1])
    throw new RangeError("Unreachable choice: " + value);
  const current = choiceInterval(tableChoice(g.digits[key], table), table);
  const position = current
    ? (g.digits[key] - current[0]) / Math.max(1, current[1] - current[0])
    : 0.5;
  g.digits[key] = range[0] + Math.round(position * (range[1] - range[0]));
}