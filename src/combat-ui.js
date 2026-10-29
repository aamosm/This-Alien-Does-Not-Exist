import { STAT_NAMES, STAT_HELP, ABILITIES } from "./combat.js";
import { duelURL } from "./duel-links.js";
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
export function createCombatUI({ generate }) {
  const $ = (id) => document.getElementById(id);
  let current = null;
  $("open-duel").addEventListener("click", () => {
    if (!current) return;
    const opponent = generate(current.identity.seed === "17" ? "42" : "17");
    const code = new Uint32Array(2);
    crypto.getRandomValues(code);
    location.href = duelURL(
      current,
      opponent,
      { battleSeed: Array.from(code, (n) => n.toString(36)).join("-") },
      [],
      location.href,
    );
  });
  return {
    show(record) {
      current = record;
      $("open-duel").disabled = !record;
      $("combat-values").replaceChildren();
      $("combat-abilities").replaceChildren();
      $("combat-stats").hidden = !record || record.combat.absolute;
      if (!record || record.combat.absolute) return;
      for (const [key, label] of Object.entries(STAT_NAMES)) {
        const p = node("p");
        p.title = STAT_HELP[key];
        p.append(
          node("span", label),
          node("strong", String(Math.round(record.combat.stats[key]))),
        );
        $("combat-values").append(p);
      }
      for (const id of record.combat.abilities) {
        const a = ABILITIES[id];
        $("combat-abilities").append(node("p", a.name + " — " + a.description));
      }
    },
  };
}
