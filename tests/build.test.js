import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";

test("incomplete templates fail the build without overwriting working pages", () => {
  mkdirSync(".test-output", { recursive: true });
  const folder = mkdtempSync(path.resolve(".test-output/build-"));
  const outputs = ["index.html", "duel.html", "alien-api.js", "api.html"];
  const app = readFileSync("src/index.template.html", "utf8");
  const duel = readFileSync("src/duel.template.html", "utf8");
  try {
    mkdirSync(path.join(folder, "src"));
    mkdirSync(path.join(folder, "scripts"));
    copyFileSync("scripts/build.mjs", path.join(folder, "scripts/build.mjs"));
    for (const name of ["styles.css", "duel.css"])
      copyFileSync(name, path.join(folder, name));
    for (const name of outputs) writeFileSync(path.join(folder, name), "keep");
    for (const [bundle, original] of [["app", app], ["duel", duel]]) {
      for (const tag of ["style", "script"]) {
        const slot = `<${tag} data-bundle="${bundle}">`;
        for (const changed of [
          original.replace(slot, `<${tag}>`),
          original + `${slot}</${tag}>`,
        ]) {
          writeFileSync(path.join(folder, "src/index.template.html"),
            bundle === "app" ? changed : app);
          writeFileSync(path.join(folder, "src/duel.template.html"),
            bundle === "duel" ? changed : duel);
          const result = spawnSync(process.execPath, ["scripts/build.mjs"], {
            cwd: folder,
            encoding: "utf8",
          });
          assert.notEqual(result.status, 0);
          assert(result.stderr.includes(`Invalid ${bundle} template:`), result.stderr);
          assert(result.stderr.includes(slot), result.stderr);
          for (const name of outputs)
            assert.equal(readFileSync(path.join(folder, name), "utf8"), "keep");
        }
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
