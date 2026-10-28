import { hashKey, mix64 } from "./random.js";

export const COMBAT_RULESET = 1;
export const STAT_NAMES = Object.freeze({
  vitality: "Vitality",
  power: "Power",
  defense: "Defense",
  dexterity: "Dexterity",
  speed: "Speed",
  intellect: "Intellect",
  resolve: "Resolve",
  recovery: "Recovery",
});
export const ABILITIES = Object.freeze({
  bulwark: {
    name: "First Shell",
    description: "Takes 28% less damage while at full health.",
  },
  surge: {
    name: "Last Ember",
    description: "Deals 20% more damage below 30% health.",
  },
  surefoot: {
    name: "True Bearing",
    description: "Adds 6 percentage points to hit chance, up to 97%.",
  },
  quickening: {
    name: "Rising Tempo",
    description: "Gains 6% initiative per completed turn, up to 30%.",
  },
  insight: {
    name: "Quiet Calculation",
    description: "Feints deal 12% more damage.",
  },
  tenacity: {
    name: "Unbroken Thread",
    description:
      "Once, survives a lethal hit at 1 health if above 20% before the hit.",
  },
  renewal: {
    name: "Returning Pulse",
    description: "Restores 4% health on its third, sixth and ninth turns.",
  },
  vigor: {
    name: "Deep Reserve",
    description: "Maximum health +8%; starts with 125 energy instead of 100.",
  },
});
export const ACTIONS = Object.freeze({
  strike: {
    name: "Strike",
    cost: 8,
    description: "Efficient physical attack. Power against defense.",
  },
  feint: {
    name: "Feint",
    cost: 18,
    description: "Dexterity and intellect; partly bypasses guard and armor.",
  },
  guard: {
    name: "Guard",
    cost: 0,
    description:
      "Blocks 55% of strikes or 18% of feints until the next action; restores 18 energy.",
  },
  recover: {
    name: "Recover",
    cost: 0,
    description: "Restores 26 energy. Healing has a three-turn cooldown.",
  },
  focus: {
    name: "Focus",
    cost: 8,
    description:
      "Empowers the next two attacks. High intellect increases the bonus.",
  },
});
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const round = (n) => Math.round(n * 1000) / 1000;
const KEYS = Object.keys(STAT_NAMES);
const abilityFor = {
  vitality: "vigor",
  power: "surge",
  defense: "bulwark",
  dexterity: "surefoot",
  speed: "quickening",
  intellect: "insight",
  resolve: "tenacity",
  recovery: "renewal",
};
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
    const pool = KEYS.map((key) => ({
      id: abilityFor[key],
      weight: (stats[key] / 100) ** 2,
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
const has = (f, a) => f.profile.abilities.includes(a);
const roll = (s, actor, tag) =>
  Number(mix64(hashKey(`${s.key}|${s.round}|${actor.id}|${tag}`)) >> 11n) /
  9007199254740992;
function fighter(record) {
  const profile = combatProfile(record),
    maxHP = profile.absolute
      ? null
      : Math.round(
          (180 + 2 * profile.stats.vitality) *
            (profile.abilities.includes("vigor") ? 1.08 : 1),
        );
  const maxEnergy = profile.abilities.includes("vigor") ? 125 : 100;
  return {
    id: idOf(record),
    identity: record.identity,
    profile,
    maxHP,
    hp: maxHP,
    energy: profile.absolute ? null : maxEnergy,
    maxEnergy: profile.absolute ? null : maxEnergy,
    guard: false,
    focus: 0,
    turns: 0,
    lastHeal: -3,
    saved: false,
    lastAction: null,
  };
}
export function createBattle(left, right, { battleSeed = "0" } = {}) {
  if (typeof battleSeed !== "string" || battleSeed.length > 128)
    throw new TypeError(
      "Battle seed must be a string of at most 128 characters.",
    );
  const fighters = [fighter(left), fighter(right)];
  const state = {
    ruleset: COMBAT_RULESET,
    key: [...fighters.map((f) => f.id)].sort().join("|") + "|" + battleSeed,
    round: 0,
    maxRounds: 40,
    fighters,
    winner: null,
    finished: false,
    reason: null,
    log: [],
  };
  const [a, b] = fighters;
  if (a.profile.absolute || b.profile.absolute) {
    state.finished = true;
    state.winner =
      a.profile.absolute === b.profile.absolute
        ? null
        : a.profile.absolute
          ? 0
          : 1;
    state.reason = state.winner === null ? "absolute-draw" : "absolute";
  } else if (a.id === b.id) {
    state.finished = true;
    state.reason = "identical";
  }
  return state;
}
export function chooseAction(state, index) {
  if (![0, 1].includes(index))
    throw new TypeError("Fighter index must be 0 or 1.");
  const a = state.fighters[index],
    b = state.fighters[1 - index];
  if (a.profile.absolute || state.finished) return "strike";
  const s = a.profile.stats;
  if (a.energy < 8) return "recover";
  const reasoning = clamp(s.intellect / 180, 0.25, 0.98);
  if (roll(state, a, "decision") > reasoning)
    return a.energy >= 18 && roll(state, a, "guess") < 0.4 ? "feint" : "strike";
  if (a.hp < a.maxHP * 0.45 && a.turns - a.lastHeal >= 3) return "recover";
  if (a.energy < 18) return a.hp < a.maxHP * 0.7 ? "recover" : "guard";
  if (!a.focus && b.hp > b.maxHP * 0.6 && a.hp > a.maxHP * 0.4) return "focus";
  return (b.guard || s.intellect + s.dexterity > 2.05 * s.power) &&
    a.energy >= 18
    ? "feint"
    : "strike";
}
export function stepBattle(input, leftAction, rightAction) {
  if (input.ruleset !== COMBAT_RULESET)
    throw new TypeError("Unsupported combat ruleset.");
  if (input.finished) return structuredClone(input);
  const actions = [
    leftAction ?? chooseAction(input, 0),
    rightAction ?? chooseAction(input, 1),
  ];
  if (actions.some((a) => !Object.hasOwn(ACTIONS, a)))
    throw new TypeError("Unknown combat action.");
  const s = structuredClone(input);
  s.round++;
  const initiative = (f) =>
    f.profile.stats.speed *
    (has(f, "quickening") ? 1 + Math.min(0.3, 0.06 * f.turns) : 1);
  const order = [0, 1].sort(
    (i, j) =>
      initiative(s.fighters[j]) - initiative(s.fighters[i]) ||
      roll(s, s.fighters[j], "initiative") -
        roll(s, s.fighters[i], "initiative"),
  );
  for (const i of order) {
    const a = s.fighters[i],
      b = s.fighters[1 - i],
      p = a.profile.stats,
      q = b.profile.stats;
    if (a.hp <= 0 || b.hp <= 0) break;
    a.turns++;
    a.guard = false;
    a.energy = Math.min(a.maxEnergy, a.energy + 6);
    let action = actions[i];
    if (a.energy < ACTIONS[action].cost) action = "recover";
    a.energy -= ACTIONS[action].cost;
    a.lastAction = action;
    const event = {
      round: s.round,
      actor: i,
      action,
      damage: 0,
      healing: 0,
      hit: null,
      critical: false,
      ability: [],
    };
    if (has(a, "renewal") && a.turns <= 9 && a.turns % 3 === 0) {
      const h = Math.min(a.maxHP - a.hp, Math.round(a.maxHP * 0.04));
      a.hp += h;
      event.healing += h;
      event.ability.push("renewal");
    }
    if (action === "guard") {
      a.guard = true;
      a.energy = Math.min(a.maxEnergy, a.energy + 18);
    } else if (action === "recover") {
      a.energy = Math.min(a.maxEnergy, a.energy + 26);
      if (a.turns - a.lastHeal >= 3) {
        const h = Math.min(
          a.maxHP - a.hp,
          Math.round(a.maxHP * 0.08 + p.recovery * 0.12),
        );
        a.hp += h;
        event.healing += h;
        a.lastHeal = a.turns;
      }
    } else if (action === "focus") a.focus = 2;
    else {
      const feint = action === "feint";
      const chance = clamp(
        (feint ? 0.91 : 0.86) +
          (p.dexterity - q.speed) / 900 +
          (a.focus ? 0.03 : 0) +
          (has(a, "surefoot") ? 0.06 : 0),
        0.65,
        0.97,
      );
      event.hit = roll(s, a, "hit") < chance;
      if (event.hit) {
        let damage =
          ((feint
            ? 16 + 0.18 * p.dexterity + 0.28 * p.intellect
            : 20 + 0.42 * p.power) *
            100) /
          (feint ? 95 + 0.4 * q.defense : 75 + 0.65 * q.defense);
        if (a.focus) damage *= Math.min(2.2, 1.65 + p.intellect / 1000);
        if (has(a, "surge") && a.hp <= a.maxHP * 0.3) {
          damage *= 1.2;
          event.ability.push("surge");
        }
        if (has(a, "insight") && feint) {
          damage *= 1.12;
          event.ability.push("insight");
        }
        if (has(b, "bulwark") && b.hp === b.maxHP) {
          damage *= 0.72;
          event.ability.push("bulwark");
        }
        if (b.guard) damage *= feint ? 0.82 : 0.45;
        event.critical =
          roll(s, a, "critical") <
          0.04 + (0.12 * p.dexterity) / (p.dexterity + q.resolve);
        if (event.critical) damage *= 1.35;
        let amount = Math.max(1, Math.round(damage));
        if (
          amount >= b.hp &&
          has(b, "tenacity") &&
          !b.saved &&
          b.hp > b.maxHP * 0.2
        ) {
          amount = b.hp - 1;
          b.saved = true;
          event.ability.push("tenacity");
        }
        event.damage = Math.min(b.hp, amount);
        b.hp -= event.damage;
      }
      if (a.focus) a.focus--;
    }
    s.log.push(event);
    if (b.hp <= 0) {
      s.finished = true;
      s.winner = i;
      s.reason = "knockout";
      break;
    }
  }
  if (!s.finished && s.round >= s.maxRounds) {
    s.finished = true;
    s.reason = "round-limit";
  }
  return s;
}
export function simulateBattle(left, right, options = {}) {
  return finishBattle(createBattle(left, right, options));
}
export function finishBattle(initial) {
  let state = structuredClone(initial);
  while (!state.finished) state = stepBattle(state);
  return state;
}