import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const options = {
  absWorkingDir: root,
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  legalComments: "none",
};
function inlineAssets(template, name, css, script) {
  for (const [tag, content] of [
    ["style", css],
    ["script", script.replace(/<\/script/gi, "<\\/script")],
  ]) {
    const slot = new RegExp(
      `<${tag} data-bundle="${name}">[\\s\\S]*?</${tag}>`,
      "g",
    );
    if ([...template.matchAll(slot)].length !== 1) {
      throw new Error(
        `Invalid ${name} template: expected one <${tag} data-bundle="${name}"> element.`,
      );
    }
    template = template.replace(
      slot,
      () => `<${tag} data-bundle="${name}">\n${content}\n</${tag}>`,
    );
  }
  return template;
}
const [template, css, duelTemplate, duelCSS] = await Promise.all([
  readFile(root + "src/index.template.html", "utf8"),
  readFile(root + "styles.css", "utf8"),
  readFile(root + "src/duel.template.html", "utf8"),
  readFile(root + "duel.css", "utf8"),
]);
inlineAssets(template, "app", "", "");
inlineAssets(duelTemplate, "duel", "", "");
const worker = (
  await build({ ...options, entryPoints: ["src/catalogue-worker.js"] })
).outputFiles[0].text;
const skin = (await build({ ...options, entryPoints: ["src/skin-worker.js"] }))
  .outputFiles[0].text;
const app = (
  await build({
    ...options,
    entryPoints: ["src/app.js"],
    define: {
      __CATALOGUE_WORKER__: JSON.stringify(worker),
      __SKIN_WORKER__: JSON.stringify(skin),
    },
  })
).outputFiles[0].text;
const api = (
  await build({ ...options, entryPoints: ["src/api.js"], format: "esm" })
).outputFiles[0].text;
const apiPage = (
  await build({
    ...options,
    entryPoints: ["src/api-page.js"],
    format: "esm",
    target: "es2022",
  })
).outputFiles[0].text;
const duelApp = (await build({ ...options, entryPoints: ["src/duel-page.js"] }))
  .outputFiles[0].text;
const html = inlineAssets(template, "app", css, app);
const duelHTML = inlineAssets(duelTemplate, "duel", duelCSS, duelApp);
await writeFile(root + "index.html", html);
await writeFile(root + "alien-api.js", api);
await writeFile(
  root + "api.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alien data</title><style>body{margin:24px;background:#111;color:#ddd;font:13px/1.6 monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><pre>Static API bridge. Import alien-api.js for a JavaScript API, or use ?op=generate&amp;v=2&amp;seed=42. This page executes in the browser; it is not an HTTP JSON endpoint.</pre><script type="module">${apiPage.replace(/<\/script/gi, "<\\/script")}</script></html>`,
);

await writeFile(root + "duel.html", duelHTML);
console.log(`Built self-contained index.html (${Buffer.byteLength(html)} bytes).`);
console.log(`Built self-contained duel.html (${Buffer.byteLength(duelHTML)} bytes).`);
