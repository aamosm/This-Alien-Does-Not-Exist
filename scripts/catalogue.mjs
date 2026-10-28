import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { parseArgs } from "node:util";
import { generate, catalogueRecord } from "../src/engine.js";
import { legacyRecord } from "../legacy/adapter.js";
import { P_D } from "../src/pi.js";
import { seedString, MASK } from "../src/random.js";
import {
  FIELDS,
  matches,
  similarity,
  validateFilters,
} from "../src/registry.js";

const { values: args } = parseArgs({
  options: {
    count: { type: "string", default: "1000" },
    start: { type: "string", default: "0" },
    version: { type: "string", default: "v2" },
    out: { type: "string" },
    filter: { type: "string", multiple: true, default: [] },
    like: { type: "string" },
    rank: { type: "string", default: "balanced" },
    limit: { type: "string", default: "40" },
    identities: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (args.help) {
  console.log(
    "Usage: npm run catalogue -- [--count 1000] [--start 0] [--version v2] [--out specimens.jsonl]\n  --filter field:eq|min|max:value (repeat for AND criteria)\n  --like SEED --rank balanced|anatomy|appearance|ecology --limit 40\n  --identities emits only version/seed for compact imports. Existing files are never overwritten.",
  );
  process.exit(0);
}
let output;
try {
  if (!["v1", "v2"].includes(args.version))
    throw new Error("Version must be v1 or v2.");
  if (!["balanced", "anatomy", "appearance", "ecology"].includes(args.rank))
    throw new Error("Unknown ranking.");
  const count = Number(args.count),
    limit = Number(args.limit),
    start = BigInt(seedString(args.start, args.version));
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000000)
    throw new Error("Count must be between 1 and 1,000,000.");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw new Error("Limit must be between 1 and 10,000.");
  if (start + BigInt(count) - 1n > (args.version === "v1" ? 4294967296n : P_D))
    throw new Error("Survey exceeds the engine seed range.");
  const filters = args.filter.map((raw) => {
    const [field, op, ...rest] = raw.split(":"),
      text = rest.join(":"),
      spec = FIELDS[field];
    if (!spec || !text.length) throw new Error("Invalid filter: " + raw);
    if (spec.type === "boolean" && !["true", "false"].includes(text))
      throw new Error("Boolean filters require true or false.");
    const value =
      spec.type === "category"
        ? text
        : spec.type === "boolean"
          ? text === "true"
          : Number(text);
    return { field, op, value };
  });
  validateFilters(filters);
  const make = (seed) =>
    catalogueRecord(
      generate(seed, { generatorVersion: args.version === "v1" ? 1 : 2 }),
    );
  const target =
    args.like === undefined ? null : make(seedString(args.like, args.version));
  const weights =
    args.rank === "balanced"
      ? { anatomy: 1, appearance: 1, ecology: 0.5 }
      : { anatomy: 0, appearance: 0, ecology: 0, [args.rank]: 1 };
  output = args.out
    ? createWriteStream(args.out, { flags: "wx" })
    : process.stdout;
  const completion = args.out ? finished(output) : null;
  completion?.catch(() => {});
  if (args.out) await once(output, "open");
  let matched = 0,
    written = 0;
  const ranked = [],
    started = performance.now();
  const emit = async (record, comparison = null) => {
    const value = args.identities
      ? { identity: record.identity, generatorVersion: record.generatorVersion }
      : comparison
        ? { ...record, comparison }
        : record;
    if (!output.write(JSON.stringify(value) + "\n"))
      await once(output, "drain");
    written++;
  };
  for (let i = 0; i < count; i++) {
    const record = make((start + BigInt(i)).toString());
    if (
      (target && record.identity.seed === target.identity.seed) ||
      !matches(record, filters)
    )
      continue;
    matched++;
    if (!target) await emit(record);
    else {
      const comparison = similarity(target, record, weights);
      if (!comparison) continue;
      ranked.push({ record, comparison });
      ranked.sort((a, b) => b.comparison.score - a.comparison.score);
      if (ranked.length > limit) ranked.pop();
    }
  }
  for (const item of ranked) await emit(item.record, item.comparison);
  if (args.out) {
    output.end();
    await completion;
  }
  console.error(
    JSON.stringify(
      {
        surveyed: count,
        matched,
        written,
        version: args.version,
        start: start.toString(),
        elapsedMs: Math.round(performance.now() - started),
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (output && output !== process.stdout) output.destroy();
  console.error(error.message);
  process.exitCode = 1;
}
