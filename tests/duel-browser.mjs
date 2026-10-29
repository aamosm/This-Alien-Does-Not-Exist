import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium } from "playwright";
import { P_D } from "../src/pi.js";
let browser, server, origin;
before(async () => {
  await mkdir(".test-output", { recursive: true });
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
async function open(
  query = "?left=42&right=17&battle=check&terrain=wetland&time=night",
  opts = {},
) {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
      ...opts,
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/duel.html" + query);
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  return { context, page, errors };
}
async function round(page, move = "strike") {
  const sleep = await page.locator('[data-move="sleep"]').count();
  const card = page.locator(`[data-move="${sleep ? "sleep" : move}"]`);
  if (!(await card.isVisible()))
    await page.locator("#more-moves summary").click();
  await card.click();
  await page.locator("#play-round").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#round-status").textContent.includes("playing"),
  );
}

test("arena explains choices, honors setup, animates attacks and fits desktop/mobile", async () => {
  const { page, context, errors } = await open();
  assert.match(await page.locator("#conditions").innerText(), /Wetland.*Night/);
  await page.locator("#help-toggle").click();
  assert.match(await page.locator("#help").innerText(), /not a creature seed/);
  await page.locator("#help-toggle").click();
  await page.locator("#begin").click();
  assert.equal(await page.locator("#moves button").count(), 6);
  assert.equal(await page.locator("#extra-moves button").count(), 7);
  assert(!(await page.locator("#more-moves").getAttribute("open")));
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
    "rgb(10, 10, 10)",
  );
  assert((await page.locator("#play-round").boundingBox()).y < 900);
  await page.locator('[data-move="recover"]').click();
  assert.match(
    await page.locator("#move-explanation").innerText(),
    /Does not heal/,
  );
  await page.locator('[data-move="strike"]').click();
  const still = await page.locator("#arena").evaluate((c) => c.toDataURL());
  await page.locator("#play-round").click();
  await page.waitForTimeout(160);
  const moving = await page.locator("#arena").evaluate((c) => c.toDataURL());
  assert.notEqual(still, moving);
  await page.screenshot({
    path: ".test-output/duel-motion.png",
    fullPage: true,
  });
  await page.waitForFunction(
    () =>
      !document.querySelector("#round-status").textContent.includes("playing"),
  );
  assert.match(await page.locator("#round-status").innerText(), /Round 2/);
  assert((await page.locator("#events li").count()) >= 2);
  await page.screenshot({
    path: ".test-output/duel-desktop.png",
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.screenshot({
    path: ".test-output/duel-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
});
test("Rest explains two sleeping turns, sleep advances, and settings invalidate an ongoing battle", async () => {
  const { page, context, errors } = await open(undefined, {
    reducedMotion: "reduce",
  });
  await page.locator("#begin").click();
  await round(page, "rest");
  assert.match(await page.locator("#fighter-0").innerText(), /Asleep/);
  assert.match(await page.locator("#play-round").innerText(), /sleeping/);
  await round(page);
  await round(page);
  assert(!(await page.locator("#fighter-0").innerText()).includes("Asleep"));
  await page.locator("#terrain").selectOption("dunes");
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  assert.match(await page.locator("#conditions").innerText(), /Dunes/);
  assert.equal(
    await page.locator("#round-status").innerText(),
    "Ready to begin",
  );
  assert.deepEqual(errors, []);
  await context.close();
});
test("autoplay advances visible rounds, pauses and cancels cleanly when settings change", async () => {
  const { page, context, errors } = await open();
  await page.locator("#begin").click();
  await page.locator("#autoplay").click();
  assert.match(await page.locator("#autoplay").innerText(), /Pause/);
  await page.locator("#autoplay").click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#round-status").textContent.includes("playing"),
  );
  const status = await page.locator("#round-status").innerText();
  assert.match(status, /Round 2/);
  await page.waitForTimeout(650);
  assert.equal(await page.locator("#round-status").innerText(), status);
  await page.locator("#autoplay").click();
  await page.locator("#terrain").selectOption("forest");
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  await page.waitForTimeout(650);
  assert.equal(
    await page.locator("#round-status").innerText(),
    "Ready to begin",
  );
  assert.deepEqual(errors, []);
  await context.close();
});
test("copied replay reproduces played rounds and completes without secretly auto-resolving", async () => {
  const { page, context, errors } = await open(undefined, {
    reducedMotion: "reduce",
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text) => {
          window.copied = text;
        },
      },
    });
  });
  await page.locator("#begin").click();
  await round(page, "focus");
  await round(page, "strike");
  await round(page, "recover");
  const before = await page.locator(".fighters").innerText();
  await page.locator("#copy-encounter").click();
  const url = await page.evaluate(() => window.copied);
  assert(url.includes("moves="));
  await page.goto(url);
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  assert.match(await page.locator("#notice").innerText(), /3 recorded/);
  await page.locator("#begin").click();
  for (let i = 0; i < 3; i++) {
    await page.locator("#play-round").click();
    await page.waitForFunction(
      () =>
        !document
          .querySelector("#round-status")
          .textContent.includes("playing"),
    );
  }
  assert.equal(await page.locator(".fighters").innerText(), before);
  assert.match(
    await page.locator("#notice").innerText(),
    /Recorded rounds complete/,
  );
  assert.deepEqual(errors, []);
  await context.close();
});
test("endpoint, invalid replay, upper seed limit, legacy and standalone HTML stay usable", async () => {
  const { page, context, errors } = await open(
    "?leftPi=1000&right=3&battle=end",
  );
  assert.match(
    await page.locator("#round-status").innerText(),
    /no finite contest/,
  );
  assert.equal(await page.locator("#fighter-0 progress").count(), 0);
  await page.locator("#setup-panel > summary").click();
  await page.locator("#right-seed").fill("circle");
  await page.locator("#preview").click();
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  assert.equal(await page.locator("#round-status").innerText(), "Draw");
  await page.locator("#left-seed").fill((P_D + 1n).toString());
  await page.locator("#preview").click();
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("large"),
  );
  assert(await page.locator("#encounter").isHidden());
  await page.goto(origin + "/duel.html?left=42&right=17&moves=zz");
  assert.match(await page.locator("#notice").innerText(), /Invalid replay/);
  await page.goto(origin + "/duel.html?left=42&right=17&lv=1");
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  await page.goto(
    pathToFileURL(path.resolve("duel.html")).href +
      "#left=42&right=17&battle=offline",
  );
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  await page.locator("#begin").click();
  await round(page);
  assert.match(await page.locator("#round-status").innerText(), /Round 2/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("new opponents vary without replacing your creature and a shared match preserves both", async () => {
  const { page, context, errors } = await open(undefined, {
    reducedMotion: "reduce",
  });
  const seeds = new Set([await page.locator("#right-seed").inputValue()]);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("n");
    await page.waitForFunction(
      () => !document.querySelector("#encounter").hidden,
    );
    const seed = await page.locator("#right-seed").inputValue();
    assert(!seeds.has(seed));
    seeds.add(seed);
    assert.equal(await page.locator("#left-seed").inputValue(), "42");
    assert.equal(
      await page.locator("#round-status").innerText(),
      "Ready to begin",
    );
  }
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text) => {
          window.copied = text;
        },
      },
    }),
  );
  await page.locator("#copy-encounter").click();
  const url = await page.evaluate(() => window.copied),
    right = await page.locator("#right-seed").inputValue();
  await page.goto(url);
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  assert.equal(await page.locator("#right-seed").inputValue(), right);
  await page.goto(origin + "/duel.html");
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  assert.notEqual(await page.locator("#right-seed").inputValue(), "17");
  assert.notEqual(
    await page.locator("#right-seed").inputValue(),
    await page.locator("#left-seed").inputValue(),
  );
  assert.deepEqual(errors, []);
  await context.close();
});

test("visible shortcuts select, play, pause and explain combos without firing in inputs or help", async () => {
  const { page, context, errors } = await open(undefined, {
    reducedMotion: "reduce",
  });
  assert.match(await page.locator('[data-move="focus"]').innerText(), /5/);
  await page.keyboard.press("Enter");
  await page.keyboard.press("5");
  assert.match(await page.locator("#combo-tip").innerText(), /Focus → Lunge/);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.querySelector("#round-status").textContent.includes("Round 2"),
  );
  await page.keyboard.press("2");
  assert.match(await page.locator("#combo-tip").innerText(), /35%/);
  await page.keyboard.press("e");
  assert.equal(
    await page.locator('[data-move="pulse"]').getAttribute("aria-pressed"),
    "true",
  );
  assert(await page.locator('[data-move="pulse"]').isVisible());
  await page.keyboard.press("?");
  assert(await page.locator("#help").isVisible());
  const right = await page.locator("#right-seed").inputValue();
  await page.keyboard.press("n");
  assert.equal(await page.locator("#right-seed").inputValue(), right);
  await page.keyboard.press("Escape");
  assert(await page.locator("#help").isHidden());
  await page.locator("#setup-panel > summary").click();
  await page.locator("#right-seed").focus();
  await page.keyboard.press("n");
  assert((await page.locator("#right-seed").inputValue()).includes("n"));
  await page.locator("#right-seed").fill(right);
  await page.locator("#preview").click();
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  await page.locator("#begin").click();
  await page.keyboard.press("a");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () =>
      !document.querySelector("#round-status").textContent.includes("playing"),
  );
  const status = await page.locator("#round-status").innerText();
  await page.waitForTimeout(700);
  assert.equal(await page.locator("#round-status").innerText(), status);
  assert.deepEqual(errors, []);
  await context.close();
});

test("every move renders its own motion without canvas or browser errors", async () => {
  const { page, context, errors } = await open();
  const rendered = await page.evaluate(async () => {
    const { generate } = await import("./src/engine.js");
    const { createArena } = await import("./src/duel-motion.js");
    const { ACTIONS } = await import("./src/combat.js");
    const canvas = document.querySelector("#arena");
    const arena = await createArena(canvas, [generate("42"), generate("17")], {
      terrain: "plain",
      time: "day",
    });
    const views = new Set();
    for (const [action, move] of Object.entries(ACTIONS)) {
      arena.draw(
        {
          actor: 0,
          action,
          hit: true,
          damage: move.power ? 42 : 0,
          healing: ["rest", "sleep", "drain"].includes(action) ? 14 : 0,
        },
        0.55,
      );
      views.add(canvas.toDataURL());
    }
    arena.draw({ actor: 0, action: "lunge", damage: 42, hit: true }, 0.48);
    return views.size;
  });
  assert(rendered >= 12);
  await page.screenshot({
    path: ".test-output/duel-lunge.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await context.close();
});

test("battlefield, controls and persistent log stay together; inspecting a move never commits it", async () => {
  const { page, context, errors } = await open(undefined, {
    reducedMotion: "reduce",
  });
  const field = await page.locator(".battle-field").boundingBox();
  const controls = await page.locator(".controls").boundingBox();
  const log = await page.locator("#battle-log").boundingBox();
  assert(controls.y >= field.y + field.height);
  assert(log.x >= field.x + field.width);
  assert.equal(await page.locator("#fighter-0 .passive-row button").count(), 2);
  assert.equal(
    await page.locator("#fighter-0 .meter-percent").innerText(),
    "100%",
  );
  await page.locator('[data-move="lunge"]').hover();
  assert.equal(await page.locator("#inspected-name").innerText(), "Lunge");
  assert.equal(
    await page.locator("#inspection-state").innerText(),
    "Inspecting",
  );
  assert.equal(await page.locator("#chosen-label").innerText(), "Strike");
  assert.match(await page.locator("#move-metrics").innerText(), /78%/);
  assert.equal(
    await page.locator("#round-status").innerText(),
    "Ready to begin",
  );
  await page.locator('[data-move="strike"]').click();
  await page.keyboard.press("2");
  assert.equal(await page.locator("#inspected-name").innerText(), "Lunge");
  assert.equal(await page.locator("#chosen-label").innerText(), "Lunge");
  await page.locator("#fighter-0 .passive-row button").first().click();
  assert(await page.locator("#comparison").isVisible());
  assert.equal(
    await page.locator("#tab-stats").getAttribute("aria-selected"),
    "true",
  );
  await page.locator("#tab-stats").focus();
  await page.keyboard.press("ArrowLeft");
  assert(await page.locator("#battle-log").isVisible());
  await page.locator("#begin").click();
  await round(page, "strike");
  assert.equal(await page.locator("#events .round-divider").count(), 1);
  assert.equal(
    await page.locator("#events .round-divider").innerText(),
    "Round 1",
  );
  assert(await page.locator("#log-empty").isHidden());
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const inspector = await page.locator("#move-inspector").boundingBox();
    const play = await page.locator("#play-round").boundingBox();
    assert(inspector.y + inspector.height <= play.y);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForFunction(
    () => !!document.querySelector(".battle-sidebar #move-inspector"),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  const laptopButton = await page.locator("#play-round").boundingBox();
  assert(laptopButton.y + laptopButton.height <= 768);
  assert.deepEqual(errors, []);
  await context.close();
});

test("favicon uses the selected creature portrait and survives opponent changes and replay", async () => {
  const { page, context, errors } = await open(undefined, {
    reducedMotion: "reduce",
  });
  const first = await page.locator("#arena-icon").getAttribute("href");
  assert(first.startsWith("data:image/png;base64,"));
  assert.equal(
    await page.locator("#selected-portrait").getAttribute("src"),
    first,
  );
  const expected = await page.evaluate(async () => {
    const { generate } = await import("./src/engine.js");
    const { createArena } = await import("./src/duel-motion.js");
    const a = await createArena(
      document.createElement("canvas"),
      [generate("42"), generate("17")],
      { terrain: "plain", time: "day" },
    );
    const portraits = [a.portrait(0), a.portrait(1)];
    a.cancel();
    return portraits;
  });
  assert.equal(first, expected[0]);
  assert.notEqual(first, expected[1]);
  const visiblePixels = await page.evaluate(async () => {
    const image = new Image();
    image.src = document.querySelector("#arena-icon").href;
    await image.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 64, 64).data).filter(
      (v, i) => i % 4 === 3 && v > 0,
    ).length;
  });
  assert(visiblePixels > 50 && visiblePixels < 4096);
  await page.locator("#new-opponent").click();
  await page.waitForFunction(
    () => !document.querySelector("#encounter").hidden,
  );
  assert.equal(await page.locator("#arena-icon").getAttribute("href"), first);
  await page.locator("#setup-panel > summary").click();
  let previous = first;
  for (const seed of ["99", "3", "31415926535897", "circle", "42"]) {
    await page.locator("#left-seed").fill(seed);
    await page.locator("#preview").click();
    await page.waitForFunction(
      () => !document.querySelector("#encounter").hidden,
    );
    const next = await page.locator("#arena-icon").getAttribute("href");
    assert(next.startsWith("data:image/png;base64,"));
    assert.notEqual(next, previous);
    previous = next;
  }
  assert.equal(previous, first);
  assert.deepEqual(errors, []);
  await context.close();
});

test("legacy and cancelled previews cannot leave a stale favicon; invalid seeds clear it", async () => {
  const { page, context, errors } = await open(
    "?left=42&right=17&lv=1&battle=legacy-icon",
  );
  assert.equal(
    await page.locator("#arena-icon").getAttribute("data-version"),
    "1",
  );
  assert(
    (await page.locator("#arena-icon").getAttribute("href")).startsWith(
      "data:image/png;base64,",
    ),
  );
  await page.goto(origin + "/duel.html?left=43&right=17&lv=1&battle=race", {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#setup-panel > summary").click();
  await page.locator("#left-seed").fill("99");
  await page.locator("#preview").click();
  await page.waitForFunction(
    () => document.querySelector("#arena-icon").dataset.seed === "99",
  );
  const latest = await page.locator("#arena-icon").getAttribute("href");
  await page.waitForTimeout(800);
  assert.equal(await page.locator("#arena-icon").getAttribute("href"), latest);
  assert.equal(
    await page.locator("#arena-icon").getAttribute("data-version"),
    "2",
  );
  await page.locator("#left-seed").fill((P_D + 1n).toString());
  await page.locator("#preview").click();
  await page.waitForFunction(() =>
    document.querySelector("#notice").textContent.includes("large"),
  );
  assert.equal(
    await page.locator("#arena-icon").getAttribute("href"),
    "data:,",
  );
  assert(await page.locator("#selected-portrait").isHidden());
  await page.goto(
    pathToFileURL(path.resolve("duel.html")).href +
      "#left=99&right=17&battle=offline",
  );
  await page.waitForFunction(
    () => document.querySelector("#arena-icon").dataset.seed === "99",
  );
  assert.equal(await page.locator("#arena-icon").getAttribute("href"), latest);
  assert.deepEqual(errors, []);
  await context.close();
});
