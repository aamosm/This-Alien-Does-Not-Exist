import { generate } from "../src/engine.js";
import {
  simulateBattle,
  COMBAT_RULESET,
  TERRAINS,
  TIMES,
} from "../src/combat.js";
import { mix64 } from "../src/random.js";
import { writeFile } from "node:fs/promises";
import { piSeed } from "../src/pi.js";
import { schema } from "../src/api.js";

const records = Array.from({ length: 120 }, (_, i) =>
  generate(mix64(BigInt(i) + 50000n).toString()),
);

const byAbility = {},
  wins = records.map(() => 0),
  matches = records.map(() => 0);

const durations = [],
  conditions = {};

let draws = 0,
  rounds = 0;

for (let i = 0; i < records.length; i++)
  for (let j = 1; j <= 8; j++) {
    const k = (i + j * 13) % records.length,
      b = simulateBattle(records[i], records[k], {
        battleSeed: `${i}-${j}`,
        terrain: Object.keys(TERRAINS)[(i * 8 + j - 1) % 5],
        time: Object.keys(TIMES)[Math.floor((i * 8 + j - 1) / 5) % 3],
      });

    durations.push(b.round);

    const setting = b.environment.terrain + "/" + b.environment.time;
    conditions[setting] = (conditions[setting] ?? 0) + 1;

    rounds += b.round;
    draws += Number(b.winner === null);

    for (const [side, index] of [
      [0, i],
      [1, k],
    ]) {
      matches[index]++;
      wins[index] += Number(b.winner === side);

      for (const ability of records[index].combat.abilities) {
        byAbility[ability] ??= { appearances: 0, wins: 0 };
        byAbility[ability].appearances++;
        byAbility[ability].wins += Number(b.winner === side);
      }
    }
  }

const report = {
  ruleset: COMBAT_RULESET,
  specimens: 120,
  battles: 960,
  ordinaryBudget: 800,
  draws,
  meanRounds: rounds / 960,
  duration: {
    min: Math.min(...durations),
    median: [...durations].sort((a, b) => a - b)[480],
    max: Math.max(...durations),
    atMostTwo: durations.filter((n) => n <= 2).length,
  },
  conditions,
  byAbility,
  perSpecimenWinRange: [
    Math.min(...wins.map((w, i) => w / matches[i])),
    Math.max(...wins.map((w, i) => w / matches[i])),
  ],
  piExamples: [1, 2, 14, 100, 500, 999, 1000].map((m) => ({
    m,
    profile: generate(piSeed(m)).combat,
  })),
  limits:
    "Deterministic automated-play sample. Passive win rates include their associated stat distributions, not isolated causal effects. Pi progression and the final disc intentionally exceed ordinary parity.",
};

await writeFile(
  new URL("../docs/combat-balance.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);

console.log(JSON.stringify({ ...report, piExamples: undefined }, null, 2));

await writeFile(
  new URL("../docs/schema.json", import.meta.url),
  JSON.stringify(schema(), null, 2) + "\n",
);