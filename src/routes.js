import { normalizeSeed, piLength, piSeed } from "./pi.js";
export function parseRoute(input, basePath = "") {
  const url = new URL(input, "https://alien.invalid"),
    p =
      url.protocol === "file:" && url.hash
        ? new URLSearchParams(url.hash.slice(1))
        : url.searchParams;
  for (const key of ["seed", "pi", "v", "route", "p"])
    if (p.getAll(key).length > 1)
      throw new Error("Address contains duplicate identity parameters.");
  if (p.has("route") || p.has("p")) {
    const target = new URL(p.get("route") ?? p.get("p"), url.origin);
    if (
      target.origin !== url.origin ||
      target.searchParams.has("route") ||
      target.searchParams.has("p")
    )
      throw new Error("Invalid redirect address.");
    return parseRoute(
      target.href,
      basePath ||
        url.pathname.replace(/\/[^/]*\.html$/i, "").replace(/\/$/, ""),
    );
  }
  let version = Number(p.get("v") ?? 2);
  if (![1, 2].includes(version)) throw new Error("Unknown generator version.");
  if (p.has("seed") && p.has("pi"))
    throw new Error("Use one identity parameter.");
  if (p.has("pi")) {
    if (version !== 2)
      throw new Error("This path belongs to the current generator.");
    const raw = p.get("pi");
    if (!/^\d{1,4}$/.test(raw)) throw new Error("Invalid path position.");
    const m = Number(raw);
    return { version: "v2", generatorVersion: 2, seed: piSeed(m), pi: m };
  }
  if (p.has("seed")) {
    const seed = normalizeSeed(p.get("seed"), version);
    return {
      version: `v${version}`,
      generatorVersion: version,
      seed,
      ...(version === 2 && piLength(seed) ? { pi: piLength(seed) } : {}),
    };
  }
  if (url.protocol === "file:") return null;
  const base = basePath.replace(/\/$/, "");
  if (base && url.pathname !== base && !url.pathname.startsWith(base + "/"))
    throw new Error("Address is outside this application.");
  const path = url.pathname.slice(base.length).replace(/^\/+|\/+$/g, "");
  if (!path || /\.html$/i.test(path) || url.pathname.endsWith("/")) return null;
  const match = /^(?:(v[12])\/)?(\d+)$/.exec(path);
  if (!match) throw new Error("This address does not identify an alien.");
  if (match[1]) version = Number(match[1].slice(1));
  const seed = normalizeSeed(match[2], version);
  return {
    version: `v${version}`,
    generatorVersion: version,
    seed,
    ...(version === 2 && piLength(seed) ? { pi: piLength(seed) } : {}),
  };
}
export function routeURL(identity, location = "https://alien.invalid/") {
  const absolute = /^[a-z]+:/i.test(location),
    url = new URL(location, "https://alien.invalid"),
    version =
      identity.generatorVersion ?? Number(identity.version?.slice(1) ?? 2),
    seed = normalizeSeed(identity.seed, version),
    m = version === 2 ? piLength(seed) : null,
    p = new URLSearchParams();
  p.set("v", String(version));
  p.set(m ? "pi" : "seed", m ? String(m) : seed);
  url.search = "";
  url.hash = "";
  if (url.protocol === "file:") url.hash = p.toString();
  else {
    url.pathname = url.pathname.replace(/\/(?:v[12]\/)?\d+\/?$/, "/");
    if (!url.pathname.endsWith("/") && !/\.html$/i.test(url.pathname))
      url.pathname += "/";
    url.search = p.toString();
  }
  return absolute ? url.href : url.pathname + url.search + url.hash;
}
