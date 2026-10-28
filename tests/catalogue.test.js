import { PI_DIGITS } from "../src/pi.js";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { validRecord } from "../src/registry.js";
const run = (...args) =>
  spawnSync(process.execPath, ["scripts/catalogue.mjs", ...args], {
    encoding: "utf8",
  });
test("offline catalogue filters canonical geometry and ranks a finite survey", () => {
  const result = run("--count", "100", "--filter", "eyeCount:eq:0");
  assert.equal(result.status, 0, result.stderr);
  const rows = result.stdout.trim().split("\n").map(JSON.parse);
  assert(rows.length > 0);
  assert(rows.every((r) => validRecord(r) && r.measurements.eyeCount === 0));
  const ranked = run(
    "--count",
    "30",
    "--like",
    "0",
    "--rank",
    "anatomy",
    "--limit",
    "5",
  );
  assert.equal(ranked.status, 0, ranked.stderr);
  const rankedRows = ranked.stdout.trim().split("\n").map(JSON.parse);
  assert.equal(rankedRows.length, 5);
  assert(!rankedRows.some((r) => r.identity.seed === "0"));
  for (let i = 1; i < rankedRows.length; i++)
    assert(
      rankedRows[i - 1].comparison.score >= rankedRows[i].comparison.score,
    );
});
test("offline catalogue preserves large seeds and refuses invalid ranges or overwrites", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "alien-catalogue-"));
  try {
    const file = path.join(folder, "sample.jsonl");
    const result = run(
      "--count",
      "1",
      "--start",
      "18446744073709551615",
      "--identities",
      "--out",
      file,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      JSON.parse(readFileSync(file, "utf8")).identity.seed,
      "18446744073709551615",
    );
    writeFileSync(file, "keep");
    assert.notEqual(run("--out", file, "--count", "1").status, 0);
    assert.equal(readFileSync(file, "utf8"), "keep");
    for (const args of [
      ["--start", PI_DIGITS, "--count", "2"],
      ["--count", "-1"],
      ["--filter", "eyeCount:min:NaN"],
      ["--filter", "tailPresent:eq:yes"],
      ["--version", "v3"],
    ])
      assert.notEqual(run(...args).status, 0);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
