import test from "node:test";
import assert from "node:assert/strict";
import { generate, catalogueRecord } from "../src/engine.js";
import {
  combatProfile,
  createBattle,
  stepBattle,
  simulateBattle,
  finishBattle,
  chooseAction,
  ABILITIES,
} from "../src/combat.js";
import { duel, request, requestFromURL, schema } from "../src/api.js";
import { piSeed } from "../src/pi.js";
import { mix64 } from "../src/random.js";

test("ordinary fighters share an exact stat budget, meaningful variation and two working passives", () => {
  const profiles = new Set();
  for (let i = 0; i < 500; i++) {
    const r = generate(mix64(BigInt(i + 100)).toString()),
      p = r.combat;
    assert.equal(p.budget, 800);
    assert.equal(
      Object.values(p.stats).reduce((a, b) => a + b, 0),
      800,
    );
    assert(
      Object.values(p.stats).every(
        (n) => Number.isFinite(n) && n >= 40 && n < 250,
      ),
    );
    assert.equal(new Set(p.abilities).size, 2);
    assert(p.abilities.every((a) => ABILITIES[a]));
    assert.deepEqual(catalogueRecord(r).combat, p);
    profiles.add(JSON.stringify(p.stats));
  }
  assert(profiles.size > 490);
  assert.equal(generate("42", { generatorVersion: 1 }).combat.budget, 800);
});
test("the human sequence gains intellect monotonically while physical trade-offs persist; circle has no numbers", () => {
  let intellect = 0;
  for (let m = 1; m < 1000; m++) {
    const p = generate(piSeed(m)).combat;
    assert(p.stats.intellect > intellect);
    intellect = p.stats.intellect;
    assert(Object.values(p.stats).every(Number.isFinite));
  }
  const a = generate("3").combat,
    b = generate(piSeed(999)).combat;
  assert(b.stats.power < a.stats.power);
  assert(b.stats.defense > a.stats.defense);
  assert(b.stats.dexterity < a.stats.dexterity);
  const c = generate("circle").combat;
  assert.equal(c.stats, null);
  assert.equal(c.budget, null);
  assert.deepEqual(c.abilities, []);
});
test("duels are reproducible, bounded, symmetric in seat order and never mutate records or prior states", () => {
  for (let i = 0; i < 80; i++) {
    const a = generate(mix64(BigInt(i + 40)).toString()),
      b = generate(mix64(BigInt(i + 400)).toString());
    const copy = structuredClone(a),
      s = createBattle(a, b),
      before = structuredClone(s),
      next = stepBattle(s, "strike", "guard");
    assert.deepEqual(s, before);
    assert.deepEqual(a, copy);
    assert.equal(next.round, 1);
    const x = simulateBattle(a, b, { battleSeed: "trial" }),
      y = simulateBattle(b, a, { battleSeed: "trial" });
    assert.deepEqual(x, simulateBattle(a, b, { battleSeed: "trial" }));
    assert(x.finished && x.round <= 40 && x.log.length <= 80);
    assert.equal(
      x.winner === null ? null : x.fighters[x.winner].id,
      y.winner === null ? null : y.fighters[y.winner].id,
    );
    assert(
      x.fighters.every(
        (f) =>
          f.hp >= 0 &&
          f.hp <= f.maxHP &&
          f.energy >= 0 &&
          f.energy <= f.maxEnergy,
      ),
    );
  }
});
test("circle overrides all finite combat and paired circles or identical identities draw", () => {
  const circle = generate("circle");
  for (const r of [
    generate("3"),
    generate(piSeed(999)),
    generate("42"),
    generate("42", { generatorVersion: 1 }),
  ]) {
    assert.equal(simulateBattle(circle, r).winner, 0);
    assert.equal(simulateBattle(r, circle).winner, 1);
    assert.equal(simulateBattle(circle, r).round, 0);
  }
  assert.equal(simulateBattle(circle, circle).winner, null);
  assert.equal(
    simulateBattle(generate("42"), generate("42")).reason,
    "identical",
  );
});
test("all actions execute, healing is bounded, invalid actions fail and combat API regenerates fighters", async () => {
  let s = createBattle(generate("42"), generate("17"));
  for (const a of ["focus", "feint", "guard", "recover", "strike"]) {
    s = stepBattle(s, a, "guard");
    assert(s.log.some((e) => e.actor === 0 && e.action === a));
  }
  assert.throws(() => stepBattle(s, "invalid", "strike"), /action/);
  assert.throws(
    () => createBattle(generate("42"), generate("17"), { battleSeed: 1 }),
    /string/,
  );
  assert.throws(() => chooseAction(s, 2), /index/);
  assert(finishBattle(s).finished);
  assert.equal(schema().combat.ordinaryBudget, 800);
  assert.deepEqual(
    await request(requestFromURL("https://x/api/duel?left=42&right=3")),
    duel("42", "3"),
  );
  assert.equal(
    (await request(requestFromURL("https://x/api/duel?leftPi=1000&right=3")))
      .winner,
    0,
  );
  assert.throws(
    () => requestFromURL("https://x/api/duel?left=3&leftPi=1&right=42"),
    /exactly one/,
  );
});

test("compact sequence identities cannot silently select the legacy mapping", () => {
  assert.throws(
    () => requestFromURL("https://x/api/duel?leftPi=1&lv=1&right=42"),
    /current generator/,
  );
});