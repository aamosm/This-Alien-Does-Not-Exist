import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/engine.js";
import {
  createBattle,
  stepBattle,
  simulateBattle,
  effectiveStats,
  conditions,
  ABILITIES,
  ACTIONS,
  actionAvailability,
  environmentFor,
} from "../src/combat.js";
import { duelURL, parseDuelURL } from "../src/duel-links.js";
import { motionRig, deformVertex } from "../src/duel-motion.js";
import { request, requestFromURL } from "../src/api.js";
const left = generate("42"),
  right = generate("17");
const battle = () =>
  createBattle(left, right, {
    battleSeed: "test",
    terrain: "plain",
    time: "day",
  });
function neutral() {
  const s = battle();
  for (const f of s.fighters) {
    f.profile.abilities = [];
    for (const k of Object.keys(f.profile.stats)) f.profile.stats[k] = 100;
    f.ecology = { ...f.ecology, activeAt: "any" };
  }
  return s;
}

test("guard protects this entire round for faster and slower fighters; invalid actions do not mutate or become Breathe", () => {
  for (const speed of [20, 200]) {
    const s = neutral();
    s.fighters[0].profile.stats.speed = speed;
    const guarded = stepBattle(s, "guard", "strike"),
      unguarded = stepBattle(s, "recover", "strike");
    const damage = (x) =>
      x.log.find((e) => e.actor === 1 && e.action === "strike").damage;
    assert(damage(guarded) > 0);
    assert(damage(guarded) < damage(unguarded) * 0.5);
  }
  const s = neutral();
  s.fighters[0].energy = 0;
  const copy = structuredClone(s);
  assert.throws(() => stepBattle(s, "lunge", "strike"), /energy/);
  assert.deepEqual(s, copy);
  assert(actionAvailability(s, 0, "recover").available);
});
test("rest sleeps for exactly two turns; cooldowns, energy and Breathe are explicit", () => {
  let s = neutral();
  s.fighters[0].hp = 100;
  s.fighters[0].energy = 40;
  s = stepBattle(s, "rest", "recover");
  assert.equal(s.fighters[0].sleep, 2);
  assert.throws(() => stepBattle(s, "strike", "recover"), /Asleep/);
  for (let i = 1; i >= 0; i--) {
    s = stepBattle(s, "sleep", "recover");
    assert.equal(s.fighters[0].sleep, i);
  }
  assert(!actionAvailability(s, 0, "rest").available);
  const hp = s.fighters[0].hp;
  s = stepBattle(s, "recover", "recover");
  assert.equal(s.fighters[0].hp, hp);
  const exhausted = neutral();
  exhausted.round = 46;
  exhausted.fighters[0].hp = 100;
  assert.equal(stepBattle(exhausted, "rest", "recover").fighters[0].hp, 100);
});
test("encounter code chooses conditions independently of fighters, terrain overrides and activity advantages are visible", () => {
  assert.deepEqual(
    environmentFor({ battleSeed: "a" }),
    environmentFor({ battleSeed: "a" }),
  );
  assert.equal(
    environmentFor({ battleSeed: "a", terrain: "wetland" }).terrain,
    "wetland",
  );
  for (const value of ["", "x".repeat(65), 5])
    assert.throws(() => environmentFor({ battleSeed: value }), /code/);
  assert.throws(() => environmentFor({ terrain: "ocean" }), /terrain/);
  const s = neutral();
  s.fighters[0].ecology.activeAt = "night";
  assert(
    conditions(s.fighters[0], { terrain: "plain", time: "night" }).bonuses
      .speed >
      conditions(s.fighters[0], { terrain: "plain", time: "day" }).bonuses
        .speed,
  );
  assert.equal(s.fighters[0].sleep, 0);
  const wet = neutral();
  wet.fighters[0].ecology.moisture = 0.95;
  assert(
    conditions(wet.fighters[0], { terrain: "wetland", time: "day" }).bonuses
      .speed >
      conditions(wet.fighters[0], { terrain: "dunes", time: "day" }).bonuses
        .speed,
  );
});
test("all 24 passive abilities have observable game effects, including conditional and defensive passives", () => {
  const direct = {
    quickening: ["speed", 6],
    dunewalker: ["speed", 0, "dunes"],
    marshrunner: ["speed", 0, "wetland"],
    anchored: ["defense", 0, "scree"],
  };
  for (const [id, [key, round, terrain]] of Object.entries(direct)) {
    const s = neutral();
    s.round = round;
    if (terrain) s.environment.terrain = terrain;
    const before = effectiveStats(s.fighters[0], s)[key];
    s.fighters[0].profile.abilities = [id];
    assert(effectiveStats(s.fighters[0], s)[key] > before, id);
  }
  let vigor = false;
  for (let i = 10; i < 500; i++) {
    const r = generate(String(i));
    if (r.combat.abilities.includes("vigor")) {
      const f = createBattle(r, right).fighters[0];
      assert.equal(f.maxEnergy, 125);
      assert.equal(
        f.maxHP,
        Math.round((300 + 2 * r.combat.stats.vitality) * 1.08),
      );
      vigor = true;
      break;
    }
  }
  assert(vigor);
  const setup = {
    bulwark: [1, "strike", "recover"],
    surge: [0, "strike", "recover"],
    surefoot: [0, "strike", "recover"],
    insight: [0, "pulse", "recover"],
    tenacity: [1, "lunge", "recover"],
    renewal: [0, "recover", "recover"],
    antivenom: [1, "venom", "recover"],
    wakeful: [1, "lull", "recover"],
    shedskin: [0, "recover", "recover"],
    barbs: [1, "strike", "recover"],
    siphon: [0, "strike", "recover"],
    shellguard: [1, "strike", "recover"],
    torpor: [0, "rest", "recover"],
    dew: [0, "recover", "recover"],
    sunfeed: [0, "recover", "recover"],
    nightvision: [0, "strike", "recover"],
    bastion: [1, "strike", "guard"],
    breaker: [0, "strike", "guard"],
    opportunist: [0, "strike", "recover"],
  };
  assert.equal(
    Object.keys(setup).length + Object.keys(direct).length + 1,
    Object.keys(ABILITIES).length,
  );
  for (const [id, [side, a, b]] of Object.entries(setup)) {
    let observed = false;
    for (let trial = 0; trial < 300 && !observed; trial++) {
      const s = neutral();
      s.key = "ability-test-" + trial;
      s.fighters[side].profile.abilities = [id];
      if (["surge", "siphon", "torpor", "renewal", "dew"].includes(id))
        s.fighters[0].hp = s.fighters[0].maxHP * 0.25;
      if (["renewal", "shedskin"].includes(id)) s.round = 2;
      if (id === "shedskin") {
        s.fighters[0].poison = 2;
        s.fighters[0].slow = 2;
      }
      if (id === "sunfeed") s.fighters[0].energy = 0;
      if (id === "dew") s.environment.terrain = "wetland";
      if (id === "nightvision") s.environment.time = "night";
      if (id === "opportunist") s.fighters[1].slow = 2;
      if (id === "tenacity") {
        s.fighters[1].hp = 30;
        s.fighters[1].maxHP = 100;
        s.fighters[0].profile.stats.power = 300;
      }
      const baseline = structuredClone(s);
      baseline.fighters[side].profile.abilities = [];
      const withAbility = stepBattle(s, a, b),
        without = stepBattle(baseline, a, b);
      const result = (x) =>
        x.fighters.map((f) => ({
          hp: f.hp,
          energy: f.energy,
          poison: f.poison,
          slow: f.slow,
          sleep: f.sleep,
          saved: f.saved,
        }));
      observed =
        JSON.stringify(result(withAbility)) !== JSON.stringify(result(without));
    }
    assert(observed, id + " must change an actual outcome, not only a label");
  }
});
test("every move resolves or explains why unavailable; no type matchup is introduced", () => {
  for (const id of Object.keys(ACTIONS)) {
    let s = neutral();
    s.fighters[0].hp = 250;
    if (id === "sleep") s.fighters[0].sleep = 2;
    const result = stepBattle(s, id, "recover");
    assert(
      result.log.some((e) => e.actor === 0 && e.action === id),
      id,
    );
    assert(
      result.fighters.every(
        (f) => f.hp >= 0 && f.energy >= 0 && f.energy <= f.maxEnergy,
      ),
    );
  }
});
test("links replay exact rounds including actions and environment; compact endpoints and offline/project paths work", async () => {
  const opts = { battleSeed: "a code", terrain: "wetland", time: "night" };
  let state = createBattle(left, right, opts);
  const history = [
    ["focus", "guard"],
    ["strike", "feint"],
    ["recover", "recover"],
  ];
  for (const pair of history) state = stepBattle(state, ...pair);
  for (const base of [
    "https://example.org/project/42",
    "file:///tmp/project/index.html",
  ]) {
    const link = duelURL(left, right, opts, history, base),
      parsed = parseDuelURL(link);
    assert.match(link, /project\/duel.html/);
    assert.deepEqual(parsed.history, history);
    let replay = createBattle(
      generate(parsed.left),
      generate(parsed.right),
      parsed.options,
    );
    for (const pair of parsed.history) replay = stepBattle(replay, ...pair);
    assert.deepEqual(replay, state);
  }
  const circle = duelURL(generate("circle"), left, opts);
  assert(circle.includes("leftPi=1000"));
  assert(circle.length < 200);
  assert.throws(
    () => parseDuelURL("https://x/duel.html?left=42&right=17&r=999"),
    /ruleset/,
  );
  assert.throws(
    () => parseDuelURL("https://x/duel.html?left=42&right=17&moves=zz"),
    /replay/,
  );
  const api = await request(
    requestFromURL(
      "https://x/api/duel?left=42&right=17&battle=a%20code&terrain=wetland&time=night",
    ),
  );
  assert.equal(api.environment.terrain, "wetland");
  assert.equal(api.environment.time, "night");
});
test("continuous motion keeps shared vertices attached and does not invert the surface grid", () => {
  const records = [
    generate("3"),
    generate("31415926535897"),
    generate("circle"),
    ...Array.from({ length: 80 }, (_, i) => generate(String(i + 50))),
  ];
  for (const r of records) {
    const original = JSON.stringify(r.geometry),
      rig = motionRig(r);
    for (const phase of [0, 1, 2, 3, 4, 5]) {
      const grid = [];
      for (let y = 0; y <= 12; y++)
        for (let x = 0; x <= 12; x++) {
          const p = { x: (x * 320) / 12, y: (y * 320) / 12 },
            a = deformVertex(p, rig, phase);
          assert.deepEqual(a, deformVertex({ ...p }, rig, phase));
          assert(Math.hypot(a.x - p.x, a.y - p.y) <= 11.201);
          grid.push(a);
        }
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 12; x++) {
          const a = y * 13 + x;
          for (const [i, j, k] of [
            [a, a + 1, a + 14],
            [a, a + 14, a + 13],
          ]) {
            const [p, q, t] = [grid[i], grid[j], grid[k]];
            assert((q.x - p.x) * (t.y - p.y) - (q.y - p.y) * (t.x - p.x) > 0);
          }
        }
    }
    assert.equal(JSON.stringify(r.geometry), original);
  }
});
test("ordinary pacing sample lasts multiple tactical rounds with bounded duration", () => {
  const rounds = [];
  for (let i = 20; i < 100; i++)
    rounds.push(
      simulateBattle(generate(String(i)), generate(String(i + 200))).round,
    );
  rounds.sort((a, b) => a - b);
  assert(rounds[0] >= 6);
  assert(rounds[40] >= 14 && rounds[40] <= 40);
  assert(rounds.at(-1) <= 60);
});