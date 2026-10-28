import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, mkdtemp, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { PI_DIGITS, P_D, piSeed } from "../src/pi.js";
let browser, server, origin;
before(async () => {
  await mkdir(".test-output", { recursive: true });
  await mkdir("docs/images", { recursive: true });
  server = spawn(process.execPath, ["scripts/serve.mjs", "0"]);
  origin = await new Promise((r) =>
    server.stdout.once("data", (d) => r(String(d).match(/http:\/\/\S+/)[0])),
  );
  browser = await chromium.launch({ args: ["--no-sandbox"] });
});
after(async () => {
  await browser?.close();
  server?.kill();
});
async function ready(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("#alienCanvas")?.getAttribute("aria-busy") ===
      "false",
  );
}
async function opened(url = origin + "/?v=2&seed=42", options = {}) {
  const context = await browser.newContext({
      viewport: { width: 1360, height: 1000 },
      ...options,
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await ready(page);
  return { context, page, errors };
}
async function load(page, seed) {
  await page.locator("#seedInput").fill(seed);
  await page.locator("#navigation").evaluate((f) => f.requestSubmit());
  await ready(page);
}
async function exported(page) {
  await page.locator("#open-save").click();
  const promise = page.waitForEvent("download");
  await page.locator("#save-format").selectOption("record");
  await page.locator("#save-download").click();
  return JSON.parse(await readFile(await (await promise).path(), "utf8"));
}
async function runSearch(page) {
  await page.locator("#find-matches").click();
  await page.waitForFunction(() =>
    /constructed results|contradictory|cannot/.test(
      document.querySelector("#search-status").textContent,
    ),
  );
}

test("search is visible before scrolling and favicon follows the alien's Quick render", async () => {
  const { page, context, errors } = await opened();
  const icon = await page.locator("#alien-favicon").getAttribute("href");
  assert.match(icon, /^data:image\/png;base64,/);
  const expected = await page.evaluate(async () => {
    const { generate } = await import("/src/engine.js"),
      { render } = await import("/src/render.js");
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    render(c.getContext("2d"), generate("42"), 64, 64, { background: false });
    return c.toDataURL("image/png");
  });
  assert.equal(icon, expected);
  await page.locator("#render-mode").selectOption("quick");
  await ready(page);
  assert.equal(await page.locator("#alien-favicon").getAttribute("href"), icon);
  for (const [width, height] of [
    [1360, 768],
    [900, 650],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => scrollTo(0, 0));
    const rect = await page.locator("#open-search").boundingBox();
    assert(rect.y >= 0 && rect.y + rect.height < height);
    await page
      .getByRole("button", { name: "Search & filters", exact: true })
      .click();
    assert(await page.locator("#filters .filter-row").first().isVisible());
    await page.locator("#close-search").click();
  }
  assert.equal(await page.locator(".toolbar button").count(), 3);
  assert.equal(await page.getByRole("button", { name: /^Export/ }).count(), 0);
  await load(page, "43");
  assert.notEqual(
    await page.locator("#alien-favicon").getAttribute("href"),
    icon,
  );
  assert.deepEqual(errors, []);
  await context.close();
});

test(
  "minimal layout, lit Skin and Quick, JSON/PNG export, responsive search",
  { timeout: 60000 },
  async () => {
    const { page, context, errors } = await opened();
    const skin = await page
      .locator("canvas")
      .first()
      .evaluate((c) => c.toDataURL());
    await page.screenshot({ path: "docs/images/site.png" });
    await page.locator("#render-mode").selectOption("quick");
    await ready(page);
    assert.notEqual(
      await page
        .locator("canvas")
        .first()
        .evaluate((c) => c.toDataURL()),
      skin,
    );
    const r = await exported(page);
    assert.equal(r.generatorVersion, 2);
    assert.equal(r.identity.seed, "42");
    assert(r.materials.oklch);
    assert(r.claims.every((c) => c.evidence.length));
    const png = page.waitForEvent("download");
    await page.locator("#open-save").click();
    await page.locator("#save-format").selectOption("image");
    await page.locator("#save-download").click();
    assert.equal(
      (await readFile(await (await png).path())).subarray(1, 4).toString(),
      "PNG",
    );
    await page.locator("#open-search").click();
    await page.locator('[data-preset="eyes"]').click();
    await runSearch(page);
    assert.equal(await page.locator(".result").count(), 6);
    await page
      .locator("#search-dialog")
      .screenshot({ path: "docs/images/search.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(
      await page
        .locator("#search-dialog")
        .evaluate((d) => d.scrollWidth <= d.clientWidth),
    );
    await page.screenshot({ path: ".test-output/search-mobile.png" });
    assert.deepEqual(errors, []);
    await context.close();
  },
);
test(
  "pi inputs: human, 14 digits, rounded prefix, full pasted pi and circle aliases",
  { timeout: 60000 },
  async () => {
    const { page, context, errors } = await opened();
    await load(page, "3");
    assert.match(
      await page.locator("#record-panel").innerText(),
      /Bilateral upright body/,
    );
    assert.equal(new URL(page.url()).searchParams.get("pi"), "1");
    assert.equal((await exported(page)).pi.m, 1);
    await load(page, piSeed(14));
    const mid = await exported(page);
    assert.equal(mid.pi.m, 14);
    assert(mid.pi.t > 0.5 && mid.pi.t < 0.57);
    await page.screenshot({ path: ".test-output/pi-middle.png" });
    await load(page, "31415926535898");
    assert.equal((await exported(page)).pi.m, 14);
    await load(
      page,
      "3.\n" +
        PI_DIGITS.slice(1)
          .match(/.{1,40}/g)
          .join(" \n"),
    );
    assert.equal(new URL(page.url()).searchParams.get("pi"), "1000");
    assert.equal(await page.locator("#record-panel").innerText(), "");
    assert(page.url().length < 100);
    const black = await page
      .locator("#alienCanvas")
      .evaluate((c) =>
        Array.from(
          c.getContext("2d").getImageData(c.width / 2, c.height / 2, 1, 1).data,
        ),
      );
    assert.deepEqual(black, [0, 0, 0, 255]);
    await load(page, "circle");
    assert.equal((await exported(page)).pi.t, 1);
    await load(page, "singularity");
    await load(page, "π");
    assert.equal(new URL(page.url()).searchParams.get("pi"), "1000");
    assert.deepEqual(errors, []);
    await context.close();
  },
);
test(
  "over-limit clears image, cancels pending render and saves no record",
  { timeout: 30000 },
  async () => {
    const { page, context } = await opened();
    const before = await page.locator("#saved-count").textContent();
    await page.locator("#seedInput").fill((P_D + 1n).toString());
    await page.locator("#navigation").evaluate((f) => f.requestSubmit());
    await page.waitForSelector("#canvas-message");
    assert.match(
      await page.locator("#canvas-message").innerText(),
      /There are more of them out there/,
    );
    assert(await page.locator("#alienCanvas").isHidden());
    assert.equal(await page.locator("#saved-count").textContent(), before);
    assert(await page.locator("#open-save").isDisabled());
    assert.equal(await page.locator("#record-panel").innerText(), "");
    await page.waitForTimeout(300);
    assert(await page.locator("#alienCanvas").isHidden());
    await load(page, "42");
    assert(await page.locator("#canvas-message").isHidden());
    await page.locator("#seedInput").fill("not a number");
    await page.locator("#navigation").evaluate((f) => f.requestSubmit());
    assert.match(await page.locator("#status").innerText(), /whole/);
    await context.close();
  },
);
test(
  "original version stays reachable and numeric history preserves versions",
  { timeout: 60000 },
  async () => {
    const { page, context, errors } = await opened(origin + "/?v=1&seed=3");
    const old = await exported(page);
    assert.equal(old.generatorVersion, 1);
    assert.notEqual(old.kind, "pi-path");
    await page.goto(origin + "/?v=2&seed=3");
    await ready(page);
    assert.equal((await exported(page)).kind, "pi-path");
    await page.goBack();
    await ready(page);
    assert.equal((await exported(page)).generatorVersion, 1);
    await context.close();
    assert.deepEqual(errors, []);
  },
);
test(
  "reverse result reproduces requested traits; query URL and static iframe API",
  { timeout: 60000 },
  async () => {
    const query = {
      constraints: [
        { field: "eyeCount", op: "eq", value: 4 },
        { field: "pattern", op: "eq", value: "Spots" },
        { field: "hue", op: "near", value: 120 },
      ],
      limit: 3,
    };
    const { page, context, errors } = await opened(
      origin + "/?v=2&q=" + encodeURIComponent(JSON.stringify(query)),
    );
    await page.waitForSelector(".result");
    assert.equal(await page.locator(".result").count(), 3);
    await page.locator(".result a").first().click();
    await ready(page);
    const r = await exported(page);
    assert.equal(r.measurements.eyeCount, 4);
    assert.equal(r.measurements.pattern, "Spots");
    assert(Math.abs(r.measurements.hue - 120) < 0.1);
    await page.goto(origin + "/api.html?op=generate&v=2&seed=42");
    await page.waitForFunction(() =>
      document.querySelector("pre").textContent.includes('"ok": true'),
    );
    assert.equal(
      JSON.parse(await page.locator("pre").innerText()).result.identity.seed,
      "42",
    );
    await page.goto(origin + "/tests/gallery.html");
    const response = await page.evaluate(async () => {
      const frame = document.createElement("iframe");
      frame.src = "/api.html";
      document.body.append(frame);
      await new Promise((r) => (frame.onload = r));
      return new Promise((resolve) => {
        addEventListener(
          "message",
          (e) => {
            if (e.data?.id === "probe") resolve(e.data);
          },
          { once: true },
        );
        frame.contentWindow.postMessage(
          {
            type: "alien:request",
            id: "probe",
            request: { op: "closest", seed: "3", options: { limit: 1 } },
          },
          location.origin,
        );
      });
    });
    assert(response.ok);
    assert.equal(response.result.results[0].record.pi.m, 2);
    assert.deepEqual(errors, []);
    await context.close();
  },
);
test(
  "HTTP API schema, generate, search, error and precision contracts",
  { timeout: 30000 },
  async () => {
    const context = await browser.newContext();
    for (const path of [
      "/api/schema",
      "/api/generate?v=2&seed=42",
      "/api/closest?v=2&pi=1&limit=1",
    ]) {
      const r = await context.request.get(origin + path);
      assert.equal(r.status(), 200);
      assert.match(r.headers()["content-type"], /application\/json/);
      assert((await r.json()).ok);
    }
    const r = await context.request.get(
      origin +
        "/api/search?q=" +
        encodeURIComponent(
          JSON.stringify({
            constraints: [
              { field: "wings", op: "eq", value: true },
              { field: "hornCount", op: "eq", value: 2 },
            ],
            limit: 1,
          }),
        ),
    );
    const data = await r.json();
    assert(data.result.results[0].exact);
    const over = await context.request.get(
      origin + "/api/generate?seed=" + (P_D + 1n).toString(),
    );
    assert.equal(over.status(), 422);
    assert.equal((await over.json()).error.name, "SeedLimitError");
    await context.close();
  },
);
test(
  "storage, mixed-version and pi imports regenerate fields atomically",
  { timeout: 60000 },
  async () => {
    const { page, context, errors } = await opened();
    await load(page, "3");
    await page.reload();
    await ready(page);
    await page.locator("#open-save").click();
    await page.locator("#import-catalogue").setInputFiles({
      name: "records.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([
          { seed: "43", generatorVersion: 2, measurements: { eyeCount: 999 } },
          { seed: "7", generatorVersion: 1 },
          { seed: piSeed(14), generatorVersion: 2 },
        ]),
      ),
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#import-status")
        .textContent.startsWith("Imported 3"),
    );
    const download = page.waitForEvent("download");
    await page.locator("#save-format").selectOption("catalogue");
    await page.locator("#save-download").click();
    const rows = (await readFile(await (await download).path(), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert(rows.some((r) => r.generatorVersion === 1));
    assert(rows.some((r) => r.kind === "pi-path" && r.pi.m === 14));
    assert(!rows.some((r) => r.measurements.eyeCount === 999));
    const count = await page.locator("#saved-count").textContent();
    await page.locator("#import-catalogue").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify([
          { seed: "44", generatorVersion: 2 },
          { seed: "42", generatorVersion: 9 },
        ]),
      ),
    });
    await page.waitForFunction(() =>
      document
        .querySelector("#import-status")
        .textContent.startsWith("Import rejected"),
    );
    assert.equal(await page.locator("#saved-count").textContent(), count);
    assert.deepEqual(errors, []);
    await context.close();
  },
);
test(
  "standalone renamed HTML, offline inverse search and local-worker fallback",
  { timeout: 60000 },
  async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "alien-"));
    await copyFile("index.html", path.join(folder, "alien.html"));
    const { page, context, errors } = await opened(
      pathToFileURL(path.join(folder, "alien.html")).href + "#v=2&seed=42",
    );
    await context.setOffline(true);
    await load(page, "circle");
    assert.equal(new URL(page.url()).hash, "#v=2&pi=1000");
    await load(page, "42");
    await page.locator("#open-search").click();
    await page.locator('[data-preset="wings"]').click();
    await runSearch(page);
    assert.equal(await page.locator(".result").count(), 6);
    assert.deepEqual(errors, []);
    await context.close();
    await rm(folder, { recursive: true, force: true });
    const ctx = await browser.newContext(),
      p = await ctx.newPage();
    await p.addInitScript(() => {
      window.Worker = undefined;
      Object.defineProperty(window, "indexedDB", {
        value: { open: () => ({}) },
      });
    });
    await p.goto(origin + "/?seed=42");
    await p.waitForSelector(".claim", { timeout: 1500 });
    await ready(p);
    await p.locator("#open-search").click();
    await p.locator('[data-preset="eyes"]').click();
    await runSearch(p);
    assert.equal(await p.locator(".result").count(), 6);
    await ctx.close();
  },
);
test(
  "random clicks stay outside pi and circular silhouettes; interrupted render stays current",
  { timeout: 60000 },
  async () => {
    const { page, context, errors } = await opened();
    await page.locator("#render-mode").selectOption("quick");
    for (let i = 0; i < 16; i++) {
      await page.locator("#alienCanvas").click();
      await ready(page);
      const seed = await page.locator("#seedInput").inputValue(),
        r = await (
          await context.request.get(
            origin + "/api/generate?seed=" + seed + "&compact=true",
          )
        ).json();
      assert.equal(r.result.kind, "alien");
      assert(r.result.measurements.circularity <= 0.8);
      assert(r.result.measurements.radialVariance >= 0.012);
    }
    await page.locator("#render-mode").selectOption("skin");
    for (const seed of ["45", "46", "47"]) {
      await page.locator("#seedInput").fill(seed);
      await page.locator("#navigation").evaluate((f) => f.requestSubmit());
    }
    await page.locator("#render-mode").selectOption("quick");
    await ready(page);
    const image = await page
      .locator("#alienCanvas")
      .evaluate((c) => c.toDataURL());
    await page.waitForTimeout(300);
    assert.equal(
      await page.locator("#alienCanvas").evaluate((c) => c.toDataURL()),
      image,
    );
    assert.equal(await page.locator("#seedInput").inputValue(), "47");
    assert.deepEqual(errors, []);
    await context.close();
  },
);
test(
  "actual 404 recovery retains compact path and original version at project base",
  { timeout: 60000 },
  async () => {
    for (const base of ["", "/project"]) {
      const ctx = await browser.newContext(),
        page = await ctx.newPage();
      await ctx.route("https://alien-test.github.io/**", async (route) => {
        const u = new URL(route.request().url()),
          rel = u.pathname.slice(base.length) || "/";
        if (/^\/\d+$/.test(rel))
          await route.fulfill({
            status: 404,
            contentType: "text/html",
            body: await readFile("404.html", "utf8"),
          });
        else
          await route.fulfill({
            response: await ctx.request.get(origin + rel + u.search),
          });
      });
      await page.goto("https://alien-test.github.io" + base + "/3?v=2");
      await ready(page);
      assert.equal(new URL(page.url()).searchParams.get("pi"), "1");
      assert.equal(new URL(page.url()).pathname, base + "/");
      await ctx.close();
    }
  },
);

test("related results vary in anatomy and keep the hidden sequence out of the interface", async () => {
  const { page, context, errors } = await opened(
    origin + "/?seed=15746261765410291626",
  );
  await page.locator("#open-search").click();
  await page.locator('[data-preset="similar"]').click();
  assert(await page.locator("#same-phenotype").isChecked());
  await runSearch(page);
  const count = await page.locator("#results article").count();
  assert(count >= 3);
  const outlines = await page
    .locator("#results canvas")
    .evaluateAll((nodes) => nodes.map((c) => c.toDataURL()));
  assert.equal(new Set(outlines).size, count);
  assert.doesNotMatch(await page.locator("#results").innerText(), /100\.0%/);
  await page.screenshot({ path: ".test-output/related-winged.png" });
  await page.locator("#same-phenotype").uncheck();
  await runSearch(page);
  await page.screenshot({ path: ".test-output/related-broad.png" });
  await page.locator("#close-search").click();
  await load(page, "3");
  assert.doesNotMatch(
    await page.locator("#alienData").innerText(),
    /transform|reconstruction|human specimens/i,
  );
  await page.screenshot({ path: ".test-output/human-observations.png" });
  await page.locator("#open-search").click();
  await page.locator('[data-preset="similar"]').click();
  await runSearch(page);
  assert.doesNotMatch(
    await page.locator("#results").innerText(),
    /pi path|step \d|sequence|transformation/i,
  );
  assert.equal(errors.length, 0);
  await context.close();
});

test("combat remains collapsed, compares stats, plays turns and handles the final disc without stats", async () => {
  const { page, context, errors } = await opened();
  assert.equal(await page.locator("#combat-stats").getAttribute("open"), null);
  await page.locator("#combat-stats summary").click();
  assert.equal(await page.locator("#combat-values strong").count(), 8);
  await page.locator("#open-duel").click();
  await page.locator("#opponent-seed").fill("3");
  await page.locator("#opponent-form").evaluate((f) => f.requestSubmit());
  assert.equal(await page.locator("#duel-comparison tbody tr").count(), 8);
  assert((await page.locator("#duel-comparison").innerText()).includes("↑"));
  await page.locator("#duel-start").click();
  await page.locator('[data-action="focus"]').click();
  assert.match(await page.locator("#duel-status").innerText(), /Round 1/);
  await page.locator('[data-action="strike"]').click();
  assert((await page.locator("#duel-log li").count()) >= 3);
  await page.locator("#duel-auto").click();
  assert.match(await page.locator("#duel-status").innerText(), /wins|Draw/);
  const result = await page.locator("#duel-status").innerText();
  await page.screenshot({ path: ".test-output/combat-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page
      .locator("#duel-dialog")
      .evaluate((d) => d.scrollWidth <= d.clientWidth),
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: ".test-output/combat-mobile.png" });
  await page.locator("#close-duel").click();
  await load(page, "circle");
  assert(await page.locator("#combat-stats").isHidden());
  assert.equal(await page.locator("#combat-values").innerText(), "");
  await page.locator("#open-duel").click();
  await page.locator("#opponent-seed").fill("3");
  await page.locator("#opponent-form").evaluate((f) => f.requestSubmit());
  await page.locator("#duel-start").click();
  assert.match(
    await page.locator("#duel-status").innerText(),
    /Current specimen wins/,
  );
  assert.equal(await page.locator("#duel-log li").count(), 0);
  await page.locator("#opponent-seed").fill("circle");
  await page.locator("#opponent-form").evaluate((f) => f.requestSubmit());
  await page.locator("#duel-start").click();
  assert.equal(await page.locator("#duel-status").innerText(), "Draw.");
  await page.locator("#close-duel").click();
  await load(page, (P_D + 1n).toString());
  assert(await page.locator("#open-duel").isDisabled());
  assert.deepEqual(errors, []);
  await context.close();
});

test("duel HTTP endpoint supports compact pi identities and validates inputs", async () => {
  const response = await fetch(origin + "/api/duel?leftPi=1000&right=42");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.winner, 0);
  assert.equal(
    (await fetch(origin + "/api/duel?left=3&right=oops")).status,
    400,
  );
  assert.equal(
    (await fetch(origin + "/api/duel?left=3&left=42&right=7")).status,
    400,
  );
});