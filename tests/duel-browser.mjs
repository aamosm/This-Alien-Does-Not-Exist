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
  await page.locator(`[data-move="${sleep ? "sleep" : move}"]`).click();
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
  assert.equal(await page.locator("#moves button").count(), 13);
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
  const { page, context, errors } = await open("", { reducedMotion: "reduce" });
  await page.locator("#begin").click();
  await round(page, "rest");
  assert.match(await page.locator("#fighter-0").innerText(), /Asleep/);
  assert.match(await page.locator("#play-round").innerText(), /sleeping/);
  await round(page);
  await round(page);
  assert(!(await page.locator("#fighter-0").innerText()).includes("Asleep"));
  await page.locator("#setup-panel summary").click();
  await page.locator("#terrain").selectOption("dunes");
  assert(await page.locator("#encounter").isHidden());
  await page.locator("#preview").click();
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
  await page.locator("#setup-panel summary").click();
  await page.locator("#new-code").click();
  assert(await page.locator("#encounter").isHidden());
  await page.locator("#preview").click();
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