export {
  createBattle,
  stepBattle,
  chooseAction,
  actionAvailability,
  availableActions,
  effectiveStats,
} from "./combat.js";
import {
  simulateBattle,
  COMBAT_RULESET,
  STAT_NAMES,
  ACTIONS,
  ABILITIES,
  TERRAINS,
  TIMES,
  MAX_ROUNDS,
} from "./combat.js";
import { piSeed } from "./pi.js";
import { piLength } from "./pi.js";
import { generate as build, catalogueRecord } from "./engine.js";
import {
  solveQuery,
  normalizeQuery,
  decodeSeed,
  seedFromGenome,
} from "./reverse.js";
import { FIELDS, OPTIONS, LABELS, UNITS, DIRECT } from "./traits.js";
import { routeURL, parseRoute } from "./routes.js";
export { normalizeQuery, decodeSeed, seedFromGenome, routeURL, parseRoute };

export function duel(
  left,
  right,
  {
    leftVersion = 2,
    rightVersion = 2,
    battleSeed = "0",
    terrain = "random",
    time = "random",
  } = {},
) {
  return simulateBattle(
    build(left, { generatorVersion: leftVersion }),
    build(right, { generatorVersion: rightVersion }),
    { battleSeed, terrain, time },
  );
}

export function generate(seed, { generatorVersion = 2, compact = false } = {}) {
  const record = build(seed, { generatorVersion });
  return compact ? catalogueRecord(record) : record;
}

export const search = solveQuery;
export const closest = (seed, options = {}) =>
  search({ ...options, like: seed, category: options.category ?? "closest" });

export function schema() {
  return {
    generatorVersions: [1, 2],
    defaultGeneratorVersion: 2,
    seed: { type: "decimal string", maxDigits: 1000 },
    operators: ["eq", "near", "min", "max"],
    fields: Object.fromEntries(
      Object.entries(FIELDS).map(([key, f]) => [
        key,
        {
          ...f,
          label: LABELS[key],
          units: UNITS[key],
          options: OPTIONS[key],
          gene: DIRECT[key]?.gene,
          formula:
            f.inverse === "derived"
              ? "conditional or derived; see reverse.js"
              : DIRECT[key]?.table
                ? "inverse cumulative interval"
                : DIRECT[key]
                  ? "x = min + (max-min) * digit/65535"
                  : "derived; see reverse.js",
        },
      ]),
    ),
    combat: {
      ruleset: COMBAT_RULESET,
      stats: STAT_NAMES,
      ordinaryBudget: 800,
      abilities: ABILITIES,
      actions: ACTIONS,
      maxRounds: MAX_ROUNDS,
      terrains: TERRAINS,
      times: TIMES,
    },
    search: {
      limit: [1, 12],
      categories: ["traits", "closest", "anatomy", "appearance", "ecology"],
      samePhenotypeDefault: true,
      globallyClosest: false,
    },
  };
}

export function requestFromURL(input) {
  const url = new URL(input, "https://alien.invalid/"),
    p = url.searchParams;

  for (const k of [
    "op",
    "api",
    "seed",
    "pi",
    "v",
    "q",
    "limit",
    "category",
    "direction",
    "left",
    "right",
    "leftPi",
    "rightPi",
    "lv",
    "rv",
    "battle",
    "terrain",
    "time",
  ])
    if (p.getAll(k).length > 1) throw new TypeError("Duplicate API parameter.");

  const op =
    p.get("op") ??
    p.get("api") ??
    url.pathname.split("/").filter(Boolean).at(-1) ??
    "schema";

  if (op === "schema") return { op };

  if (op === "duel") {
    for (const side of ["left", "right"]) {
      if (
        p.has(side + "Pi") &&
        Number(p.get(side === "left" ? "lv" : "rv") ?? 2) !== 2
      )
        throw new TypeError(
          "Compact pi identities require the current generator.",
        );

      if (p.has(side) === p.has(side + "Pi"))
        throw new TypeError(`Provide exactly one of ${side} or ${side}Pi.`);
    }

    return {
      op,
      left: p.has("leftPi") ? piSeed(Number(p.get("leftPi"))) : p.get("left"),
      right: p.has("rightPi")
        ? piSeed(Number(p.get("rightPi")))
        : p.get("right"),
      options: {
        leftVersion: Number(p.get("lv") ?? 2),
        rightVersion: Number(p.get("rv") ?? 2),
        battleSeed: p.get("battle") ?? "0",
        terrain: p.get("terrain") ?? "random",
        time: p.get("time") ?? "random",
      },
    };
  }

  if (op === "search") {
    const text = p.get("q");

    if (!text || text.length > 24000)
      throw new TypeError("Provide a query JSON parameter q (at most 24 KB).");

    return { op, query: JSON.parse(text) };
  }

  if (op === "closest") {
    const route = parseRoute("https://alien.invalid/?" + p.toString());

    if (!route) throw new TypeError("A seed is required.");

    return {
      op,
      seed: route.seed,
      options: {
        limit: Number(p.get("limit") ?? 6),
        category: p.get("category") ?? "closest",
        ...(p.has("direction") ? { direction: p.get("direction") } : {}),
        generatorVersion: route.generatorVersion,
      },
    };
  }

  if (op === "generate") {
    const route = parseRoute("https://alien.invalid/?" + p.toString());

    if (!route) throw new TypeError("A seed is required.");

    return {
      op,
      seed: route.seed,
      options: {
        generatorVersion: route.generatorVersion,
        compact: p.get("compact") === "true",
      },
    };
  }

  throw new TypeError("Unknown API operation.");
}

export async function request(input) {
  if (!input || typeof input !== "object")
    throw new TypeError("Use an API request object.");

  switch (input.op) {
    case "generate":
      return generate(input.seed, input.options);
    case "search":
      return search(input.query);
    case "closest":
      return closest(input.seed, input.options);
    case "duel":
      return duel(input.left, input.right, input.options);
    case "schema":
      return schema();
    default:
      throw new TypeError("Unknown API operation.");
  }
}

export function queryURL(query, base) {
  const u = new URL(base);
  u.search = "";
  u.hash = "";

  const portable = normalizeQuery(query);

  if (portable.like && piLength(portable.like)) {
    portable.likePi = piLength(portable.like);
    delete portable.like;
  }

  const p = new URLSearchParams({
    v: "2",
    q: JSON.stringify(portable),
  });

  if (u.protocol === "file:") u.hash = p.toString();
  else u.search = p.toString();

  return u.href;
}