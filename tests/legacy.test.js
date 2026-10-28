import test from "node:test";
import assert from "node:assert/strict";
import { legacyRecord, generateLegacy } from "../legacy/adapter.js";
import LegacyEngine from "../legacy/engine.js";
import { compiledField } from "../legacy/render.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validRecord } from "../src/registry.js";
test("legacy mapping, human exception and geometry adapters remain usable", () => {
  const fixtures = JSON.parse(
    readFileSync(new URL("./legacy-fixtures.json", import.meta.url)),
  );
  for (const fixture of fixtures) {
    const a = generateLegacy(fixture.seed);
    const plain = JSON.parse(
      JSON.stringify({ genome: a.genome, geometry: a.geometry }),
    );
    for (const p of plain.geometry.allBones) delete p.moduleRole;
    for (const p of plain.geometry.torsoBodyPrimitives || [])
      delete p.moduleRole;
    const hash = createHash("sha256")
      .update(JSON.stringify(plain))
      .digest("hex");
    assert.equal(hash, fixture.sha256);
  }
  for (const seed of ["0", "806318074", "4294967296"]) {
    const r = legacyRecord(seed);
    assert(validRecord(r));
    assert.equal(r.identity.seed, seed);
    assert.equal(r.measurements.wingCount, 0);
    assert.equal(r.measurements.mouth, null);
  }
  assert.notDeepEqual(
    generateLegacy("0").genome,
    generateLegacy("4294967296").genome,
  );
});
test("compiled legacy field preserves the original geometry field", () => {
  for (const seed of ["0", "806318074", "4294967296"]) {
    const a = generateLegacy(seed);
    LegacyEngine.fitToBounds(a, 512, 512, 60);
    const field = compiledField(a.geometry.allBones);
    for (let y = 0; y < 512; y += 37)
      for (let x = 0; x < 512; x += 37)
        assert(
          Math.abs(
            field(x, y) - LegacyEngine.evaluateField(x, y, a.geometry.allBones),
          ) < 1e-7,
        );
  }
});
