import { COMBAT_RULESET, MAX_ROUNDS, ACTIONS } from "./combat-rules.js";
import { combatProfile } from "./combat-profile.js";
import {
  ecologyProfile,
  environmentFor,
  conditions,
  randomUnit,
  clamp,
} from "./combat-environment.js";
export {
  COMBAT_RULESET,
  MAX_ROUNDS,
  STAT_NAMES,
  STAT_HELP,
  ABILITIES,
  ACTIONS,
  TERRAINS,
  TIMES,
} from "./combat-rules.js";
export { combatProfile } from "./combat-profile.js";
export { conditions, environmentFor } from "./combat-environment.js";
const has = (f, id) => f.profile.abilities.includes(id);
const roll = (s, f, tag) => randomUnit(`${s.key}|${s.round}|${f.id}|${tag}`);
const snapshot = (s) =>
  s.fighters.map((f) => ({
    hp: f.hp,
    energy: f.energy,
    sleep: f.sleep,
    poison: f.poison,
    slow: f.slow,
    focus: f.focus,
  }));
function fighter(record) {
  const profile = combatProfile(record),
    maxHP = profile.absolute
      ? null
      : Math.round(
          (300 + 2 * profile.stats.vitality) *
            (profile.abilities.includes("vigor") ? 1.08 : 1),
        );
  const maxEnergy = profile.absolute
    ? null
    : profile.abilities.includes("vigor")
      ? 125
      : 100;
  return {
    id: `${record.generatorVersion ?? record.identity.generatorVersion}:${record.identity.seed}`,
    identity: record.identity,
    profile,
    ecology: ecologyProfile(record),
    maxHP,
    hp: maxHP,
    maxEnergy,
    energy: maxEnergy,
    guard: false,
    focus: 0,
    turns: 0,
    saved: false,
    sleep: 0,
    poison: 0,
    slow: 0,
    cooldowns: {},
    lastAction: null,
  };
}
export function createBattle(left, right, options = {}) {
  const environment = environmentFor(options),
    fighters = [fighter(left), fighter(right)];
  const s = {
    ruleset: COMBAT_RULESET,
    environment,
    key: JSON.stringify([fighters.map((f) => f.id).sort(), environment]),
    round: 0,
    maxRounds: MAX_ROUNDS,
    fighters,
    winner: null,
    finished: false,
    reason: null,
    log: [],
  };
  const [a, b] = fighters;
  if (a.profile.absolute || b.profile.absolute) {
    s.finished = true;
    s.winner =
      a.profile.absolute === b.profile.absolute
        ? null
        : a.profile.absolute
          ? 0
          : 1;
    s.reason = s.winner === null ? "absolute-draw" : "absolute";
  } else if (a.id === b.id) {
    s.finished = true;
    s.reason = "identical";
  }
  return s;
}
export function effectiveStats(f, s) {
  if (f.profile.absolute) return null;
  const p = { ...f.profile.stats },
    c = conditions(f, s.environment);
  for (const [k, multiplier] of Object.entries(c.bonuses)) p[k] *= multiplier;
  if (f.slow) p.speed *= 0.8;
  if (has(f, "quickening")) p.speed *= 1 + Math.min(0.24, 0.03 * s.round);
  return p;
}
export function actionAvailability(s, index, action) {
  if (![0, 1].includes(index))
    throw new TypeError("Fighter index must be 0 or 1.");
  const f = s.fighters[index],
    move = ACTIONS[action];
  let reason = "";
  if (!move) reason = "Unknown combat action.";
  else if (s.finished) reason = "This battle has finished.";
  else if (f.sleep && action !== "sleep")
    reason = `Asleep for ${f.sleep} more turn${f.sleep === 1 ? "" : "s"}.`;
  else if (!f.sleep && action === "sleep") reason = "This creature is awake.";
  else if (action === "rest" && has(f, "wakeful"))
    reason = "Open Watch prevents sleep; use Breathe for energy.";
  else if ((f.cooldowns[action] ?? 0) > s.round)
    reason = `Ready in ${f.cooldowns[action] - s.round} round(s).`;
  else if (action === "focus" && f.focus)
    reason = `${f.focus} focused attack(s) remain.`;
  else if (f.energy < move.cost)
    reason = `Needs ${move.cost} energy; ${f.energy} available. Use Breathe.`;
  return { available: !reason, reason };
}
export function availableActions(s, index) {
  return Object.keys(ACTIONS).map((id) => ({
    id,
    ...ACTIONS[id],
    ...actionAvailability(s, index, id),
  }));
}
export function chooseAction(s, index) {
  if (![0, 1].includes(index))
    throw new TypeError("Fighter index must be 0 or 1.");
  if (s.finished) return "strike";
  const a = s.fighters[index],
    b = s.fighters[1 - index],
    ready = (id) => actionAvailability(s, index, id).available;
  if (a.sleep) return "sleep";
  if (a.hp < a.maxHP * 0.38 && ready("rest")) return "rest";
  if ((a.poison || a.slow) && ready("cleanse")) return "cleanse";
  if (a.energy < 24) return "recover";
  if (!a.focus && b.hp > b.maxHP * 0.65 && ready("focus")) return "focus";
  const p = effectiveStats(a, s);
  const scores = {
    strike: 2,
    lunge: 1.7 + p.power / 250,
    feint: 1.6 + p.intellect / 300 + (b.lastAction === "guard" ? 1 : 0),
    pulse: 1.6 + p.intellect / 200,
    sweep: b.slow ? 0.3 : 2,
    venom: b.poison || has(b, "antivenom") ? 0 : 2,
    drain: a.hp < a.maxHP * 0.65 ? 2.4 : 1,
    lull: b.sleep || has(b, "wakeful") ? 0 : 1.5,
    guard: a.energy < 40 ? 0.7 : 0.1,
  };
  // The AI sees only the previous state, never the player's current choice.
  return (
    Object.keys(scores)
      .filter(ready)
      .sort(
        (x, y) =>
          scores[y] +
          roll(s, a, "ai-" + y) * 1.1 -
          scores[x] -
          roll(s, a, "ai-" + x) * 1.1,
      )[0] ?? "recover"
  );
}
function heal(s, f, amount) {
  const fatigue = s.round > 45 ? 0 : s.round > 30 ? 0.5 : 1;
  const h = Math.max(0, Math.min(f.maxHP - f.hp, Math.round(amount * fatigue)));
  f.hp += h;
  return h;
}
function endCheck(s) {
  const dead = s.fighters.map((f) => f.hp <= 0);
  if (dead.some(Boolean)) {
    s.finished = true;
    s.winner = dead[0] === dead[1] ? null : dead[0] ? 1 : 0;
    s.reason = "knockout";
  }
}
export function stepBattle(input, leftAction, rightAction) {
  if (input.ruleset !== COMBAT_RULESET)
    throw new TypeError("Unsupported combat ruleset.");
  if (input.finished) return structuredClone(input);
  const actions = [
    leftAction ?? chooseAction(input, 0),
    rightAction ?? chooseAction(input, 1),
  ];
  for (const [i, id] of actions.entries()) {
    const result = actionAvailability(input, i, id);
    if (!result.available) throw new TypeError(result.reason);
  }
  const s = structuredClone(input);
  s.round++;
  // Guard is a declared stance for the entire round, independent of speed.
  s.fighters.forEach((f, i) => {
    f.guard = actions[i] === "guard";
  });
  const order = [0, 1].sort(
    (i, j) =>
      effectiveStats(s.fighters[j], s).speed -
        effectiveStats(s.fighters[i], s).speed ||
      roll(s, s.fighters[j], "initiative") -
        roll(s, s.fighters[i], "initiative"),
  );
  for (const i of order) {
    const a = s.fighters[i],
      b = s.fighters[1 - i],
      p = effectiveStats(a, s),
      q = effectiveStats(b, s);
    // A signal may put the slower fighter to sleep after its choice was committed.
    const action = a.sleep ? "sleep" : actions[i],
      move = ACTIONS[action];
    const e = {
      round: s.round,
      actor: i,
      action,
      damage: 0,
      healing: 0,
      hit: null,
      critical: false,
      ability: [],
      notes: [],
    };
    a.turns++;
    a.lastAction = action;
    a.energy -= move.cost;
    if (move.cooldown) a.cooldowns[action] = s.round + move.cooldown;
    if (action === "guard") a.energy += 14;
    else if (action === "recover") a.energy += 34;
    else if (action === "focus") a.focus = 2;
    else if (action === "cleanse") {
      a.poison = 0;
      a.slow = 0;
      e.healing += heal(s, a, a.maxHP * 0.04);
    } else if (action === "rest") {
      a.poison = 0;
      a.sleep = 2;
      e.healing += heal(
        s,
        a,
        (a.maxHP * 0.15 + p.recovery * 0.15) * (has(a, "torpor") ? 1.35 : 1),
      );
      if (has(a, "torpor")) e.ability.push("torpor");
      e.notes.push("Will sleep for two turns.");
    } else if (action === "sleep") {
      a.sleep--;
      a.guard = false;
      a.energy += 12;
      e.healing += heal(s, a, a.maxHP * 0.03 * (has(a, "torpor") ? 1.35 : 1));
      if (has(a, "torpor")) e.ability.push("torpor");
      e.notes.push(a.sleep ? `${a.sleep} sleeping turn remains.` : "Wakes up.");
    } else {
      let accuracy =
        move.accuracy +
        (p.dexterity - q.speed) / 1600 +
        (a.focus && move.power ? 0.03 : 0);
      if (action === "lull")
        accuracy = clamp(0.65 + (p.intellect - q.resolve) / 1800, 0.3, 0.75);
      if (has(a, "surefoot")) {
        accuracy += 0.06;
        e.ability.push("surefoot");
      }
      if (has(a, "nightvision") && s.environment.time === "night") {
        accuracy += 0.05;
        e.ability.push("nightvision");
      }
      e.hit = roll(s, a, action + "|hit") < clamp(accuracy, 0.55, 0.97);
      if (e.hit) {
        if (move.power) {
          let damage =
            ((46 +
              0.38 *
                (move.mental
                  ? 0.6 * p.intellect + 0.4 * p.dexterity
                  : p.power)) *
              move.power *
              100) /
            (85 + (move.mental ? 0.32 : 0.6) * q.defense);
          if (a.focus) damage *= 1.35;
          if (has(a, "surge") && a.hp <= a.maxHP * 0.3) {
            damage *= 1.2;
            e.ability.push("surge");
          }
          if (has(a, "insight") && ["feint", "pulse"].includes(action)) {
            damage *= 1.12;
            e.ability.push("insight");
          }
          if (has(a, "opportunist") && (b.poison || b.slow)) {
            damage *= 1.12;
            e.ability.push("opportunist");
          }
          if (has(b, "bulwark") && b.hp === b.maxHP) {
            damage *= 0.72;
            e.ability.push("bulwark");
          }
          if (b.guard) {
            damage *= move.pierce ? 0.85 : has(b, "bastion") ? 0.35 : 0.45;
            if (has(b, "bastion") && !move.pierce) e.ability.push("bastion");
            if (has(a, "breaker")) {
              damage *= 1.2;
              e.ability.push("breaker");
            }
          }
          const crit =
            roll(s, a, action + "|critical") <
            0.03 + (0.1 * p.dexterity) / (p.dexterity + q.resolve);
          e.critical = crit && !has(b, "shellguard");
          if (crit && has(b, "shellguard")) e.ability.push("shellguard");
          if (e.critical) damage *= 1.25;
          let amount = Math.max(1, Math.round(damage));
          if (
            amount >= b.hp &&
            has(b, "tenacity") &&
            !b.saved &&
            b.hp > b.maxHP * 0.2
          ) {
            amount = b.hp - 1;
            b.saved = true;
            e.ability.push("tenacity");
          }
          e.damage = Math.min(b.hp, amount);
          b.hp -= e.damage;
          if (has(a, "siphon")) {
            e.healing += heal(s, a, e.damage * 0.12);
            e.ability.push("siphon");
          }
          if (move.drain) e.healing += heal(s, a, e.damage * move.drain);
          if (has(b, "barbs") && move.contact) {
            const recoil = Math.min(a.hp, Math.round(e.damage * 0.08));
            a.hp -= recoil;
            e.recoil = recoil;
            e.ability.push("barbs");
          }
        }
        if (b.hp > 0 && move.status) {
          const blocked =
            (move.status === "poison" && has(b, "antivenom")) ||
            (move.status === "sleep" && has(b, "wakeful"));
          if (blocked) {
            e.ability.push(move.status === "poison" ? "antivenom" : "wakeful");
            e.notes.push("Status resisted.");
          } else {
            b[move.status] = move.status === "sleep" ? 2 : 3;
            e.notes.push(
              move.status === "poison"
                ? "Irritated for three round ends."
                : move.status === "slow"
                  ? "Slowed for the next two rounds."
                  : "Induced sleep.",
            );
            if (move.status === "sleep") b.guard = false;
          }
        }
      }
      if (move.power && a.focus) a.focus--;
    }
    a.energy = clamp(a.energy, 0, a.maxEnergy);
    e.snapshot = snapshot(s);
    s.log.push(e);
    endCheck(s);
    if (s.finished) break;
  }
  if (!s.finished) {
    // Simultaneous upkeep prevents seating order deciding poison/recoil draws.
    for (const [i, f] of s.fighters.entries()) {
      const e = {
        round: s.round,
        actor: i,
        action: "upkeep",
        damage: 0,
        healing: 0,
        hit: null,
        critical: false,
        ability: [],
        notes: [],
      };
      if (has(f, "shedskin") && s.round % 3 === 0 && (f.poison || f.slow)) {
        f.poison = 0;
        f.slow = 0;
        e.ability.push("shedskin");
      }
      if (f.poison) {
        e.damage = Math.min(f.hp, Math.round(f.maxHP * 0.025));
        f.hp -= e.damage;
        f.poison--;
        e.notes.push("Irritation damage.");
      }
      if (f.slow) f.slow--;
      f.guard = false;
      if (f.hp > 0) {
        if (has(f, "renewal") && s.round <= 18 && s.round % 3 === 0) {
          e.healing += heal(s, f, f.maxHP * 0.03);
          e.ability.push("renewal");
        }
        if (has(f, "dew") && s.environment.terrain === "wetland") {
          e.healing += heal(s, f, f.maxHP * 0.015);
          e.ability.push("dew");
        }
        f.energy = Math.min(
          f.maxEnergy,
          f.energy +
            5 +
            (has(f, "sunfeed") && s.environment.time === "day" ? 4 : 0),
        );
        if (has(f, "sunfeed") && s.environment.time === "day")
          e.ability.push("sunfeed");
      }
      e.snapshot = snapshot(s);
      s.log.push(e);
    }
    endCheck(s);
  }
  if (!s.finished && s.round >= s.maxRounds) {
    s.finished = true;
    s.reason = "round-limit";
  }
  return s;
}
export function finishBattle(initial) {
  let s = structuredClone(initial);
  while (!s.finished) s = stepBattle(s);
  return s;
}
export function simulateBattle(left, right, options = {}) {
  return finishBattle(createBattle(left, right, options));
}