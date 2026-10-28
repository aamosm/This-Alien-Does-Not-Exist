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
const template = await readFile(root + "src/index.template.html", "utf8"),
  css = await readFile(root + "styles.css", "utf8");
const html = template
  .replace("/* APP_STYLE */", () => css)
  .replace("/* APP_SCRIPT */", () => app.replace(/<\/script/gi, "<\\/script"));
await writeFile(root + "index.html", html);
console.log(
  `Built self-contained index.html (${Buffer.byteLength(html)} bytes).`,
);

const api = (
  await build({ ...options, entryPoints: ["src/api.js"], format: "esm" })
).outputFiles[0].text;
await writeFile(root + "alien-api.js", api);
const apiPage = (
  await build({
    ...options,
    entryPoints: ["src/api-page.js"],
    format: "esm",
    target: "es2022",
  })
).outputFiles[0].text;
await writeFile(
  root + "api.html",
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Alien data</title><style>body{margin:24px;background:#111;color:#ddd;font:13px/1.6 monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><pre>Static API bridge. Import alien-api.js for a JavaScript API, or use ?op=generate&amp;v=2&amp;seed=42. This page executes in the browser; it is not an HTTP JSON endpoint.</pre><script type="module">${apiPage.replace(/<\/script/gi, "<\\/script")}</script></html>`,
);
