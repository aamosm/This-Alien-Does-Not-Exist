import { normalizeSeed, PI_DIGITS } from "./pi.js";
// SPDX-License-Identifier: MIT
export const MASK = (1n << 64n) - 1n;
export const MAX_SEED = PI_DIGITS;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function seedString(input, version = "v2") {
  return normalizeSeed(input, version === "v1" ? 1 : 2);
}
// stafford mix13 (splitmix64) with analytical inverse
export function mix64(x) {
  x &= MASK;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return (x ^ (x >> 31n)) & MASK;
}
function unxor(x, shift) {
  let result = x;
  for (let s = shift; s < 64n; s += shift) result ^= x >> s;
  return result & MASK;
}
export function unmix64(x) {
  x = unxor(x, 31n);
  x = (x * 0x319642b2d24d8ec3n) & MASK;
  x = unxor(x, 27n);
  x = (x * 0x96de1b173f119089n) & MASK;
  return unxor(x, 30n);
}
export function hashKey(key) {
  let h = 0xcbf29ce484222325n;
  for (const c of key)
    h = ((h ^ BigInt(c.codePointAt(0))) * 0x100000001b3n) & MASK;
  return h;
}
export function choose(u, weighted) {
  const total = weighted.reduce((s, [w]) => s + w, 0);
  if (!(total > 0) || weighted.some(([w]) => !Number.isFinite(w) || w < 0))
    throw new TypeError("Invalid choice weights.");
  let value = u * total;
  for (const [weight, name] of weighted) {
    value -= weight;
    if (value < 0) return name;
  }
  return weighted.at(-1)[1];
}
export function randomSeed(cryptoObject = globalThis.crypto) {
  if (!cryptoObject?.getRandomValues)
    throw new Error(
      "Secure random generation is unavailable. Enter a seed manually.",
    );
  const bytes = cryptoObject.getRandomValues(new Uint32Array(2));
  return ((BigInt(bytes[0]) << 32n) | BigInt(bytes[1])).toString();
}
export function stream(seed, name) {
  const root = hashKey(normalizeSeed(seed) + "|" + name);
  return (key) =>
    Number(mix64(root ^ hashKey(String(key))) >> 11n) / 9007199254740992;
}
