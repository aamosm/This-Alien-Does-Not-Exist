import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../src/engine.js";
import { randomOpponent } from "../src/duel-opponents.js";
import {
  battleAdvice,
  MAIN_MOVES,
  EXTRA_MOVES,
  MOVE_KEYS,
} from "../src/duel-advice.js";
import { createBattle, ACTIONS } from "../src/combat.js";
import { motionPose } from "../src/duel-motion.js";

test("new opponents exclude the player's identity, recent seeds and special endpoints", () => {
  const left = generate("42");
  let seed = 60;
  const recent = [];
  for (let i = 0; i < 20; i++) {
    const values = ["42", "3", "circle", ...recent.slice(-10), String(seed++)];
    const opponent = randomOpponent(left, {
      recent: recent.slice(-10),
      entropy: () => values.shift() ?? String(seed++),
    });
    assert.notEqual(opponent.kind, "pi-path");
    assert.notEqual(opponent.identity.seed, "42");
    assert(!recent.includes(opponent.identity.seed));
    assert.equal(opponent.combat.budget, 800);
    recent.push(opponent.identity.seed);
  }
  assert.throws(
    () => randomOpponent(left, { entropy: () => "42" }),
    /new opponent/,
  );
});

test("all moves are reachable with unique keys and advice follows actual status and immunity", () => {
  assert.equal(new Set(Object.values(MOVE_KEYS)).size, 13);
  assert.deepEqual(
    new Set([...MAIN_MOVES, ...EXTRA_MOVES]),
    new Set(Object.keys(ACTIONS).filter((id) => id !== "sleep")),
  );
  const state = createBattle(generate("42"), generate("17"));
  const [you, opponent] = state.fighters;
  assert.match(battleAdvice(state, "focus"), /Focus → Lunge/);
  you.focus = 2;
  assert.match(battleAdvice(state, "lunge"), /next 2.*35%/);
  you.energy = 1;
  assert.match(battleAdvice(state), /Breathe restores 34/);
  you.sleep = 2;
  assert.match(battleAdvice(state), /asleep for 2/);
  you.sleep = 0;
  you.energy = 100;
  opponent.profile.abilities = ["antivenom", "wakeful"];
  assert.match(battleAdvice(state, "venom"), /cannot be irritated/);
  assert.match(battleAdvice(state, "lull"), /cannot be put to sleep/);
});

test("distinct move poses return to rest and stay within the arena for each variation", () => {
  const signatures = new Set();
  for (const action of Object.keys(ACTIONS)) {
    signatures.add(JSON.stringify(motionPose(action, 0.5)));
    for (let variant = 0; variant < 3; variant++) {
      for (let frame = 0; frame <= 50; frame++) {
        const t = frame / 50,
          p = motionPose(action, t, variant);
        assert(Object.values(p).every(Number.isFinite));
        assert(p.sx > 0 && p.sy > 0);
        assert(p.limbs >= -1e-10 && p.limbs <= 1.001);
        const radius =
          172 *
          Math.max(p.sx, p.sy) *
          (Math.cos(p.angle) + Math.abs(Math.sin(p.angle)));
        const x = 250 + p.x,
          y = 260 + p.y;
        assert(x - radius >= 0 && x + radius < 1000, action);
        assert(y - radius >= 0 && y + radius < 480, action);
        if (t === 0 || t === 1) {
          for (const key of ["x", "y", "angle", "limbs"])
            assert(Math.abs(p[key]) < 1e-8, `${action} ${key}`);
          assert(Math.abs(p.sx - 1) < 1e-8 && Math.abs(p.sy - 1) < 1e-8);
        }
      }
    }
  }
  assert(signatures.size >= 12);
  assert.notDeepEqual(
    motionPose("strike", 0.5, 0),
    motionPose("strike", 0.5, 1),
  );
});
