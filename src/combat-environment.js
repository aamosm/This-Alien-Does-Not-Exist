import { hashKey, mix64 } from "./random.js";
import { TERRAINS, TIMES } from "./combat-rules.js";
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const randomUnit = (key) =>
  Number(mix64(hashKey(key)) >> 11n) / 9007199254740992;
export function environmentFor({
  battleSeed = "0",
  terrain = "random",
  time = "random",
} = {}) {
  if (
    typeof battleSeed !== "string" ||
    !battleSeed.trim() ||
    battleSeed.length > 64
  )
    throw new TypeError(
      "Encounter code must be a non-empty string of at most 64 characters.",
    );
  const pick = (value, pool, tag) => {
    if (value === "random")
      return Object.keys(pool)[
        Math.floor(
          randomUnit(battleSeed.trim() + "|" + tag) * Object.keys(pool).length,
        )
      ];
    if (!Object.hasOwn(pool, value))
      throw new TypeError("Unknown " + tag + ".");
    return value;
  };
  return {
    battleSeed: battleSeed.trim(),
    terrain: pick(terrain, TERRAINS, "terrain"),
    time: pick(time, TIMES, "time"),
  };
}
export function ecologyProfile(record) {
  const m = record.measurements ?? {},
    e = record.environment ?? {};
  const activity = String(
    record.ecology?.activity ?? m.activity ?? "diurnal",
  ).toLowerCase();
  const cycle = ["diurnal", "nocturnal", "crepuscular"].includes(activity)
    ? activity
    : "flexible";
  return {
    cycle,
    activeAt: {
      diurnal: "day",
      nocturnal: "night",
      crepuscular: "dusk",
      flexible: "any",
    }[cycle],
    sleepWindow: {
      diurnal: "Usually rests at night",
      nocturnal: "Usually rests in daylight",
      crepuscular: "Usually rests between dawn and dusk activity peaks",
      flexible: "No preferred rest window",
    }[cycle],
    moisture: clamp(e.moisture ?? m.moisture ?? 0.5),
    cover: clamp(e.cover ?? m.cover ?? 0.5),
    support: clamp(
      0.5 + (m.limbThicknessRatio ?? 0.15) - 0.35 * (m.limbBodyRatio ?? 0.45),
    ),
  };
}
export function conditions(fighter, environment) {
  const e = fighter.ecology,
    bonuses = { speed: 1, dexterity: 1, defense: 1, recovery: 1 },
    notes = [];
  const active = e.activeAt === "any" || e.activeAt === environment.time;
  bonuses.speed *= active ? 1.06 : 0.94;
  bonuses.dexterity *= active ? 1.03 : 0.97;
  notes.push(
    active
      ? "Active window: +6% speed, +3% dexterity."
      : "Outside active window: −6% speed, −3% dexterity. Awake unless a move causes sleep.",
  );
  const t = environment.terrain;
  if (t === "wetland" || t === "dunes") {
    const fit = (e.moisture - 0.5) * (t === "wetland" ? 1 : -1),
      factor = 1 + fit * 0.16;
    bonuses.speed *= factor;
    bonuses.recovery *= factor;
    notes.push(
      `Habitat: ${fit >= 0 ? "+" : ""}${Math.round(fit * 16)}% speed and recovery.`,
    );
  }
  if (t === "forest") {
    bonuses.dexterity *= 1 + (e.cover - 0.5) * 0.16;
    notes.push("Dexterity adjusted to cover preference.");
  }
  if (t === "scree") {
    bonuses.defense *= 1 + (e.support - 0.5) * 0.16;
    notes.push("Defense adjusted to support proportions.");
  }
  const has = (id) => fighter.profile.abilities.includes(id);
  if (has("dunewalker") && t === "dunes") {
    bonuses.speed *= 1.12;
    notes.push("Sand Stride: +12% speed.");
  }
  if (has("marshrunner") && t === "wetland") {
    bonuses.speed *= 1.12;
    notes.push("Marsh Glide: +12% speed.");
  }
  if (has("anchored") && t === "scree") {
    bonuses.defense *= 1.12;
    notes.push("Stone Brace: +12% defense.");
  }
  return { active, bonuses, notes };
}