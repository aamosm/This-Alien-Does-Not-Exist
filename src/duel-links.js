import { COMBAT_RULESET, ACTIONS } from "./combat-rules.js";
import { requestFromURL } from "./api.js";
import { piLength } from "./pi.js";
import { routeURL } from "./routes.js";
const codes = Object.keys(ACTIONS);
export function duelURL(
  left,
  right,
  options = {},
  history = [],
  base = "https://alien.invalid/",
) {
  const clean = new URL(routeURL(left.identity, base));
  const u = new URL("duel.html", clean),
    p = new URLSearchParams({
      r: String(COMBAT_RULESET),
      battle: options.battleSeed ?? "0",
      terrain: options.terrain ?? "random",
      time: options.time ?? "random",
    });
  for (const [name, r] of [
    ["left", left],
    ["right", right],
  ]) {
    const version = r.generatorVersion ?? r.identity.generatorVersion ?? 2;
    const m = version === 2 ? piLength(r.identity.seed) : null;
    p.set(m ? name + "Pi" : name, m ? String(m) : r.identity.seed);
    p.set(name === "left" ? "lv" : "rv", String(version));
  }
  if (history.length) {
    if (history.length > 60) throw new Error("Replay exceeds 60 rounds.");
    p.set(
      "moves",
      history
        .map((pair) =>
          pair
            .map((id) => {
              const i = codes.indexOf(id);
              if (i < 0) throw new Error("Unknown replay action.");
              return i.toString(16);
            })
            .join(""),
        )
        .join(""),
    );
  }
  if (u.protocol === "file:") u.hash = p.toString();
  else u.search = p.toString();
  return u.href;
}
export function parseDuelURL(input) {
  const u = new URL(input),
    p =
      u.protocol === "file:"
        ? new URLSearchParams(u.hash.slice(1))
        : u.searchParams;
  for (const k of ["r", "moves"])
    if (p.getAll(k).length > 1) throw new Error("Duplicate replay parameter.");
  if (p.has("r") && p.get("r") !== String(COMBAT_RULESET))
    throw new Error("This replay uses a different combat ruleset.");
  if (!p.has("left") && !p.has("leftPi")) return null;
  const q = new URLSearchParams(p);
  q.set("op", "duel");
  const request = requestFromURL("https://alien.invalid/api.html?" + q);
  const moves = p.get("moves") ?? "";
  if (moves.length > 120 || moves.length % 2 || !/^[0-9a-d]*$/.test(moves))
    throw new Error("Invalid replay moves.");
  const history = [];
  for (let i = 0; i < moves.length; i += 2)
    history.push([
      codes[parseInt(moves[i], 16)],
      codes[parseInt(moves[i + 1], 16)],
    ]);
  return { ...request, history };
}