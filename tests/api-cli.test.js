import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { schema, queryURL, requestFromURL, request } from "../src/api.js";
import { normalizeQuery } from "../src/reverse.js";
import { PI_DIGITS } from "../src/pi.js";
test("schema and compact similarity links retain exact meaning", async () => {
  const fields = schema().fields;
  assert.equal(Object.keys(fields).length, 58);
  assert.equal(fields.circularity.inverse, "derived");
  assert.equal(fields.contrast.units, "0–0.65 scale");
  assert.match(fields.contrast.formula, /conditional/);
  const endpoint = await request(
    requestFromURL("https://test/api/closest?pi=1000&limit=1"),
  );
  assert.equal(endpoint.results[0].record.pi.m, 999);
  const link = queryURL({ like: PI_DIGITS, limit: 2 }, "https://test/project/");
  assert(link.length < 500);
  const q = normalizeQuery(JSON.parse(new URL(link).searchParams.get("q")));
  assert.equal(q.like, PI_DIGITS);
  assert.throws(() => normalizeQuery({ like: "42", likePi: 14 }));
  assert.throws(() =>
    requestFromURL("https://test/api/generate?v=2&seed=42&seed=43"),
  );
});
test("search CLI uses the inverse engine and emits reproducible results", () => {
  const r = spawnSync(
    process.execPath,
    [
      "scripts/search.mjs",
      "--query",
      JSON.stringify({
        constraints: [
          { field: "wings", op: "eq", value: true },
          { field: "eyeCount", op: "eq", value: 6 },
        ],
        limit: 1,
      }),
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const output = JSON.parse(r.stdout);
  assert.equal(output.method, "inverse-genome");
  assert(output.results[0].exact);
  const pi = spawnSync(
    process.execPath,
    ["scripts/search.mjs", "--like", "3", "--limit", "1"],
    { encoding: "utf8" },
  );
  assert.equal(pi.status, 0, pi.stderr);
  assert.equal(JSON.parse(pi.stdout).results[0].record.pi.m, 2);
  const circle = spawnSync(
    process.execPath,
    ["scripts/search.mjs", "--like", "circle", "--limit", "1"],
    { encoding: "utf8" },
  );
  assert.equal(circle.status, 0, circle.stderr);
  assert.equal(JSON.parse(circle.stdout).results[0].record.pi.m, 999);
});

test("machine queries reject typos, conflicting aliases and non-boolean locks", () => {
  assert.throws(() => normalizeQuery({ constaints: [] }), /Unknown query/);
  assert.throws(
    () => normalizeQuery({ constraints: [], filters: [] }),
    /not both/,
  );
  assert.throws(() => normalizeQuery({ samePhenotype: "false" }), /boolean/);
  assert.throws(
    () =>
      normalizeQuery({
        constraints: [{ field: "eyeCount", op: "eq", value: 4, tollerance: 1 }],
      }),
    /Unknown characteristic/,
  );
});
