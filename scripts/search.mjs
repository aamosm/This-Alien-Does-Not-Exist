import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { search, closest, schema } from "../src/api.js";
const { values: a } = parseArgs({
  options: {
    query: { type: "string" },
    file: { type: "string" },
    like: { type: "string" },
    category: { type: "string", default: "closest" },
    direction: { type: "string" },
    limit: { type: "string", default: "6" },
    out: { type: "string" },
    schema: { type: "boolean" },
    help: { type: "boolean" },
  },
});
try {
  if (a.help) {
    console.log(
      'npm run search -- --query \'{"constraints":[{"field":"eyeCount","op":"eq","value":4}]}\'\n  --file query.json | --like SEED --category anatomy --limit 6\n  --schema | --out results.json (never overwrites)',
    );
  } else {
    const result = a.schema
      ? schema()
      : a.like
        ? await closest(a.like, {
            category: a.category,
            direction: a.direction,
            limit: Number(a.limit),
          })
        : await search(
            JSON.parse(
              a.file ? await readFile(a.file, "utf8") : (a.query ?? "{}"),
            ),
          );
    const text = JSON.stringify(result, null, 2) + "\n";
    if (a.out) await writeFile(a.out, text, { flag: "wx" });
    else process.stdout.write(text);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
