import test from "node:test";
import assert from "node:assert/strict";
import {
  decode,
  ordinarySeed,
  choiceInterval,
  tableChoice,
} from "../src/grammar-genome.js";
import { TABLES } from "../src/grammar.js";
import { generate } from "../src/engine.js";
import { outlineDistance, anatomyVector } from "../src/geometry.js";
import { solveQuery } from "../src/reverse.js";

test("within-module genome positions change real anatomy without search or discovery filtering", () => {
  for (const gene of ["body", "head", "limbSet"]) {
    const g = decode("42"),
      category = tableChoice(g.digits[gene], TABLES[gene]),
      [lo, hi] = choiceInterval(category, TABLES[gene]);
    const specimens = [0.05, 0.35, 0.65, 0.95].map((t) => {
      const next = structuredClone(g);
      next.digits[gene] = Math.round(lo + t * (hi - lo));
      return generate(ordinarySeed(next));
    });
    assert.equal(new Set(specimens.map((r) => r.phenotype)).size, 1);
    assert.equal(
      new Set(specimens.map((r) => JSON.stringify(r.geometry.parts))).size,
      4,
    );
    const vectors =
      gene === "head"
        ? specimens.map((r) =>
            anatomyVector({
              parts: r.geometry.parts.filter((p) => p.role === "head"),
            }),
          )
        : specimens.map((r) => r.shapeSignature.anatomy);
    assert(outlineDistance(vectors[0], vectors[3]) > 0.025);
  }
});
test("categorical inverse constraints retain internal anatomy instead of collapsing to an interval midpoint", async () => {
  const result = await solveQuery({
    constraints: [{ field: "bodyPlan", op: "eq", value: "Spindle" }],
    limit: 6,
  });
  const values = result.results.map(
    (x) => decode(x.record.identity.seed).digits.body,
  );
  assert.equal(new Set(values).size, 6);
  assert(
    result.results.every(
      (x) => x.exact && x.record.measurements.bodyPlan === "Spindle",
    ),
  );
});