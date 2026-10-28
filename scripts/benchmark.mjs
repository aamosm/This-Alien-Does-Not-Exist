import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const { values: args } = parseArgs({
  options: {
    out: { type: "string" },
    size: { type: "string", default: "512" },
    repeats: { type: "string", default: "5" },
  },
});
const size = Number(args.size),
  repeats = Number(args.repeats);
if (
  !Number.isInteger(size) ||
  size < 128 ||
  size > 960 ||
  !Number.isInteger(repeats) ||
  repeats < 1 ||
  repeats > 20
)
  throw new Error("Use size 128–960 and repeats 1–20.");
let browser, server;
try {
  server = spawn(process.execPath, ["scripts/serve.mjs", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const origin = await new Promise((resolve, reject) => {
    server.stdout.once("data", (data) =>
      resolve(String(data).match(/http:\/\/\S+/)[0]),
    );
    server.once("error", reject);
    server.once("exit", (code) => reject(new Error("Server exited " + code)));
  });
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(origin + "/tests/gallery.html");
  const result = await page.evaluate(
    async ({ size, repeats }) => {
      const { generate } = await import("/src/engine.js"),
        { render } = await import("/src/render.js"),
        { renderSkin } = await import("/src/skin-render.js");
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const summary = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
          medianMs: sorted[Math.floor(sorted.length / 2)],
          p95Ms:
            sorted[
              Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
            ],
          samples: values.length,
        };
      };
      const plans = new Map();
      for (let i = 0; plans.size < 12; i++) {
        const r = generate(String(i));
        if (r.kind === "alien" && !plans.has(r.measurements.bodyPlan))
          plans.set(r.measurements.bodyPlan, r);
      }
      const generation = [];
      for (let i = 0; i < 1000; i++) {
        const start = performance.now();
        generate(String(i));
        generation.push(performance.now() - start);
      }
      const quick = [],
        skin = [];
      for (const record of plans.values()) {
        const draw = [],
          raster = [];
        render(ctx, record, size, size);
        ctx.getImageData(0, 0, size, size);
        for (let j = 0; j < repeats; j++) {
          const start = performance.now();
          const stats = render(ctx, record, size, size);
          ctx.getImageData(0, 0, size, size);
          draw.push(stats.renderMs);
          raster.push(performance.now() - start);
        }
        quick.push({
          seed: record.identity.seed,
          bodyPlan: record.measurements.bodyPlan,
          draw: summary(draw),
          drawAndReadback: summary(raster),
        });
      }
      for (const record of plans.values()) {
        const elapsed = [];
        await renderSkin(ctx, record, size, size);
        for (let j = 0; j < repeats; j++) {
          const start = performance.now();
          await renderSkin(ctx, record, size, size);
          ctx.getImageData(0, 0, size, size);
          elapsed.push(performance.now() - start);
        }
        skin.push({
          seed: record.identity.seed,
          bodyPlan: record.measurements.bodyPlan,
          drawAndReadback: summary(elapsed),
        });
      }
      return {
        size,
        repeats,
        generation: summary(generation),
        quick,
        skin,
        userAgent: navigator.userAgent,
      };
    },
    { size, repeats },
  );
  result.runtime = {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  };
  result.method =
    "Headless Chromium; same twelve specimens and resolution in both styles. One warmup and repeated draws with synchronous pixel readback. Skin timing includes cooperative yielding. Worker startup, transfer, network and screen presentation are excluded. These are renderer timings, not phone benchmarks or animation frame rates.";
  if (args.out)
    await writeFile(args.out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server?.kill();
}
