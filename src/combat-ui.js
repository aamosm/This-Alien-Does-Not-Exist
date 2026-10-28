import {
  STAT_NAMES,
  ABILITIES,
  ACTIONS,
  createBattle,
  stepBattle,
  finishBattle,
} from "./combat.js";
const node = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
const short = (seed) =>
  seed.length > 24 ? seed.slice(0, 12) + "…" + seed.slice(-6) : seed;
const display = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);
export function createCombatUI({ generate }) {
  const $ = (id) => document.getElementById(id);
  let current = null,
    opponent = null,
    battle = null;
  function compare() {
    battle = null;
    opponent = null;
    $("battle-seed").disabled = false;
    $("duel-start").disabled = true;
    $("duel-comparison").replaceChildren();
    $("duel-log").replaceChildren();
    $("duel-health").replaceChildren();
    $("duel-controls").hidden = true;
    try {
      if (!current) throw new Error("Load a specimen first.");
      opponent = generate($("opponent-seed").value);
      const profiles = [current.combat, opponent.combat];
      const table = node("table"),
        head = node("tr");
      for (const label of ["Stat", "Current", "Opponent"])
        head.append(node("th", label));
      const thead = node("thead");
      thead.append(head);
      table.append(thead);
      const body = node("tbody");
      if (profiles.some((p) => p.absolute)) {
        const row = node("tr"),
          cell = node("td", "A finite comparison is unavailable.");
        cell.colSpan = 3;
        row.append(cell);
        body.append(row);
      } else
        for (const [key, label] of Object.entries(STAT_NAMES)) {
          const row = node("tr");
          row.append(node("th", label));
          for (let i = 0; i < 2; i++) {
            const value = profiles[i].stats[key],
              other = profiles[1 - i].stats[key],
              cell = node("td");
            cell.append(
              node(
                value > other ? "strong" : "span",
                display(value) + (value > other ? " ↑" : ""),
              ),
            );
            row.append(cell);
          }
          body.append(row);
        }
      table.append(body);
      $("duel-comparison").append(table);
      for (let i = 0; i < 2; i++) {
        const title = i === 0 ? "Current" : "Opponent",
          record = i === 0 ? current : opponent;
        const details = node("details");
        details.className = "combat-passives";
        details.append(
          node(
            "summary",
            `${title} · ${short(record.identity.seed)}${profiles[i].abilities.length ? " · " + profiles[i].abilities.map((id) => ABILITIES[id].name).join(", ") : ""}`,
          ),
        );
        for (const id of profiles[i].abilities) {
          const p = node("p");
          p.className = "small";
          p.append(
            node("strong", ABILITIES[id].name + " — "),
            document.createTextNode(ABILITIES[id].description),
          );
          details.append(p);
        }
        $("duel-comparison").append(details);
      }
      $("duel-start").disabled = false;
      $("duel-status").textContent =
        "Higher ratings are marked ↑. Ratings are game mechanics, not biological measurements.";
    } catch (error) {
      $("duel-status").textContent = error.message;
    }
  }
  function drawBattle() {
    $("battle-seed").disabled = !battle.finished;
    $("duel-controls").hidden = false;
    for (const button of $("duel-controls").querySelectorAll("button"))
      button.disabled = battle.finished;
    $("duel-health").replaceChildren();
    for (let i = 0; i < 2; i++) {
      const f = battle.fighters[i];
      if (f.profile.absolute) continue;
      const p = node(
        "p",
        `${i === 0 ? "Current" : "Opponent"} · ${f.hp}/${f.maxHP} health · ${f.energy}/${f.maxEnergy} energy`,
      );
      const bar = node("progress");
      bar.max = f.maxHP;
      bar.value = f.hp;
      bar.setAttribute(
        "aria-label",
        i === 0 ? "Current health" : "Opponent health",
      );
      p.append(bar);
      $("duel-health").append(p);
    }
    $("duel-status").textContent = battle.finished
      ? battle.winner === null
        ? battle.reason === "round-limit"
          ? "Draw after 40 rounds."
          : "Draw."
        : `${battle.winner === 0 ? "Current specimen" : "Opponent"} wins.${battle.reason === "absolute" ? " No finite contest." : ` Round ${battle.round}.`}`
      : `Round ${battle.round} · choose an action. The opponent chooses independently.`;
    $("duel-log").replaceChildren();
    for (const e of battle.log) {
      const outcome =
        e.hit === false
          ? "miss"
          : e.damage
            ? `${e.damage} damage${e.critical ? " · critical" : ""}`
            : e.healing
              ? `${e.healing} health restored`
              : ACTIONS[e.action].name;
      const text = `${e.round}. ${e.actor === 0 ? "Current" : "Opponent"} · ${ACTIONS[e.action].name} · ${outcome}${e.ability.length ? " · " + e.ability.map((a) => ABILITIES[a].name).join(", ") : ""}`;
      $("duel-log").append(node("li", text));
    }
  }
  $("open-duel").addEventListener("click", () => {
    if (!current) return;
    $("duel-dialog").showModal();
    if (!$("opponent-seed").value)
      $("opponent-seed").value = current.identity.seed === "3" ? "42" : "3";
    compare();
  });
  $("close-duel").addEventListener("click", () => $("duel-dialog").close());
  $("opponent-form").addEventListener("submit", (event) => {
    event.preventDefault();
    compare();
  });
  $("opponent-seed").addEventListener("input", () => {
    battle = null;
    opponent = null;
    $("duel-start").disabled = true;
    $("duel-controls").hidden = true;
    $("duel-status").textContent = "Compare this seed before starting a duel.";
  });
  $("duel-start").addEventListener("click", () => {
    if (!current || !opponent) return;
    try {
      battle = createBattle(current, opponent, {
        battleSeed: $("battle-seed").value,
      });
      drawBattle();
    } catch (error) {
      $("duel-status").textContent = error.message;
    }
  });
  for (const [key, info] of Object.entries(ACTIONS)) {
    const button = node("button", info.name);
    button.type = "button";
    button.dataset.action = key;
    button.title = info.description;
    button.addEventListener("click", () => {
      if (battle && !battle.finished) {
        battle = stepBattle(battle, key);
        drawBattle();
      }
    });
    $("duel-actions").append(button);
  }
  $("duel-auto").addEventListener("click", () => {
    if (battle && !battle.finished) {
      battle = finishBattle(battle);
      drawBattle();
    }
  });
  const help = node("dl");
  for (const action of Object.values(ACTIONS)) {
    help.append(
      node("dt", `${action.name} · ${action.cost} energy`),
      node("dd", action.description),
    );
  }
  $("duel-help").append(help);
  return {
    show(record) {
      current = record;
      battle = null;
      opponent = null;
      $("duel-dialog").close();
      $("open-duel").disabled = !record;
      $("combat-values").replaceChildren();
      $("combat-abilities").replaceChildren();
      $("combat-stats").hidden = !record || record.combat.absolute;
      if (!record || record.combat.absolute) return;
      for (const [key, label] of Object.entries(STAT_NAMES)) {
        const p = node("p");
        p.append(
          node("span", label),
          node("strong", display(record.combat.stats[key])),
        );
        $("combat-values").append(p);
      }
      for (const ability of record.combat.abilities) {
        const a = ABILITIES[ability],
          p = node("p");
        p.append(
          node("strong", a.name + " — "),
          document.createTextNode(a.description),
        );
        $("combat-abilities").append(p);
      }
    },
  };
}