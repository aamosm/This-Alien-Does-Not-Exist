import { hashKey, mix64 } from "./random.js";
import { COMBAT_RULESET, STAT_NAMES, ABILITIES } from "./combat-rules.js";

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const round = (n) => Math.round(n * 1000) / 1000;
const KEYS = Object.keys(STAT_NAMES);
const idOf = (r) =>
  `${r.generatorVersion ?? r.identity.generatorVersion}:${r.identity.seed}`;
function budgetStats(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => 40 + (480 * w) / sum),
    values = exact.map(Math.floor);
  const order = exact
    .map((v, i) => [v - values[i], i])
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let i = 0, left = 800 - values.reduce((a, b) => a + b, 0); i < left; i++)
    values[order[i][1]]++;
  return Object.fromEntries(KEYS.map((key, i) => [key, values[i]]));
}
// These are game ratings derived from anatomy, not biological measurements.
export function combatProfile(record) {
  if (record.kind === "pi-path" && record.pi.t === 1)
    return {
      ruleset: COMBAT_RULESET,
      absolute: true,
      stats: null,
      budget: null,
      abilities: [],
    };
  let stats, abilities;
  if (record.kind === "pi-path") {
    const t = record.pi.t;
    stats = {
      vitality: round(110 + 50 * t),
      power: round(90 * (1 - 0.65 * t)),
      defense: round(90 + 100 * t),
      dexterity: round(110 + 140 * t - 190 * t * t),
      speed: round(100 + 80 * t - 65 * t * t),
      intellect: round(110 + 290 * t),
      resolve: round(100 + 200 * t),
      recovery: round(90 + 70 * t),
    };
    abilities =
      t < 0.2
        ? ["surefoot", "renewal"]
        : t < 0.55
          ? ["surefoot", "insight"]
          : ["insight", "tenacity"];
  } else {
    const m = record.measurements ?? {};
    const n = (key, lo, hi, fallback = 0.5) =>
      Number.isFinite(m[key]) ? clamp((m[key] - lo) / (hi - lo)) : fallback;
    const mass = (n("bodyLength", 145, 300) + n("bodyWidth", 20, 62)) / 2;
    const reach = n("limbBodyRatio", 0, 1.25),
      limbs = n("limbCount", 0, 9),
      eyes = n("eyeCount", 0, 12);
    const thickness = n("limbThicknessRatio", 0, 0.5),
      head = n("headBodyRatio", 0, 0.35);
    const caution = n("caution", 0, 1),
      exploration = n("exploration", 0, 1),
      resources = n("resources", 0, 1);
    const weights = [
      0.5 + 1.7 * mass + 0.3 * resources,
      0.5 + 1.2 * mass + 0.8 * thickness + (m.horns ? 0.15 : 0),
      0.5 + 1.2 * thickness + 0.8 * mass + 0.4 * caution,
      0.5 + 1.1 * limbs + 0.7 * eyes + 0.5 * (1 - mass),
      0.5 + 1.2 * reach + 1.1 * (1 - mass) + (m.wings ? 0.25 : 0),
      0.5 + 1.1 * head + 0.8 * exploration + 0.3 * caution,
      0.5 + 1.1 * caution + 0.6 * n("relativeGravity", 0.45, 1.8),
      0.5 + 1.3 * resources + 0.7 * n("moisture", 0, 1),
    ];
    stats = budgetStats(weights);
    const pool = Object.entries(ABILITIES).map(([id, ability]) => ({
      id,
      weight:
        (stats[ability.affinity] / 100) ** 2 *
        (id === "dew" || id === "marshrunner"
          ? 0.6 + n("moisture", 0, 1)
          : id === "dunewalker"
            ? 1.6 - n("moisture", 0, 1)
            : id === "nightvision"
              ? String(record.ecology?.activity).toLowerCase() === "nocturnal"
                ? 1.8
                : 0.7
              : 1),
    }));
    abilities = [];
    for (let slot = 0; slot < 2; slot++) {
      const total = pool.reduce((sum, x) => sum + x.weight, 0);
      let pick =
        (Number(mix64(hashKey(idOf(record) + "|ability|" + slot)) >> 11n) /
          9007199254740992) *
        total;
      let chosen = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        pick -= pool[i].weight;
        if (pick < 0) {
          chosen = i;
          break;
        }
      }
      abilities.push(pool[chosen].id);
      pool.splice(chosen, 1);
    }
  }
  return {
    ruleset: COMBAT_RULESET,
    absolute: false,
    budget: round(Object.values(stats).reduce((a, b) => a + b, 0)),
    stats,
    abilities,
  };
}