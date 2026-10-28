import { request, requestFromURL } from "../src/api.js";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || process.argv[2] || 8000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      try {
        const result = await request(requestFromURL(url.href));
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        });
        res.end(
          req.method === "HEAD"
            ? undefined
            : JSON.stringify({ ok: true, result }),
        );
      } catch (error) {
        res.writeHead(error.name === "SeedLimitError" ? 422 : 400, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            ok: false,
            error: { name: error.name, message: error.message },
          }),
        );
      }
      return;
    }
    let requested = decodeURIComponent(url.pathname);
    if (/(?:^|\/)\./.test(requested) || requested.includes("\\")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let relative =
      requested === "/" ? "index.html" : requested.replace(/^\//, "");
    if (/^(?:(?:v1|v2)\/)?\d+\/?$/.test(relative)) {
      res.writeHead(302, {
        Location:
          "/?route=" + encodeURIComponent(requested + url.search + url.hash),
      });
      res.end();
      return;
    }
    const target = path.resolve(root, relative);
    if (!target.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    const bytes = await readFile(target);
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(target)] || "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(await readFile(path.join(root, "404.html")));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Alien catalogue: http://127.0.0.1:${server.address().port}`),
);
