import { generate } from "./engine.js";
import {
  createBattle,
  stepBattle,
  chooseAction,
  availableActions,
  actionAvailability,
  effectiveStats,
  conditions,
  STAT_NAMES,
  STAT_HELP,
  ABILITIES,
  ACTIONS,
  TERRAINS,
  TIMES,
} from "./combat.js";
import { createArena } from "./duel-motion.js";
import { duelURL, parseDuelURL } from "./duel-links.js";
import { routeURL } from "./routes.js";
const $ = (id) => document.getElementById(id),
  node = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
const short = (s) => (s.length > 24 ? s.slice(0, 12) + "…" + s.slice(-6) : s);
let records = null,
  state = null,
  arena = null,
  selected = "strike",
  history = [],
  replay = [],
  replayAt = 0;
let active = false,
  busy = false,
  auto = false,
  generation = 0,
  timer = null,
  options = null,
  versions = [2, 2];
const freshCode = () => {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => n.toString(36)).join("-");
};
$("encounter-code").value = freshCode();
for (const [id, item] of Object.entries(TERRAINS)) {
  $("terrain").append(new Option(item.name, id));
}
for (const [id, label] of Object.entries(TIMES)) {
  $("time").append(new Option(label, id));
}
function pause() {
  auto = false;
  clearTimeout(timer);
  $("autoplay").textContent =
    replayAt < replay.length ? "Play recorded rounds" : "Autoplay";
}
function invalidate() {
  pause();
  generation++;
  arena?.cancel();
  arena = null;
  state = null;
  records = null;
  active = false;
  busy = false;
  $("encounter").hidden = true;
  $("notice").textContent =
    "Settings changed. Preview the encounter to apply them.";
}
function health(view = state?.fighters) {
  if (!state) return;
  for (let i = 0; i < 2; i++) {
    const f = state.fighters[i],
      v = view[i],
      section = $("fighter-" + i);
    section.replaceChildren();
    const title = node("div");
    title.className = "fighter-title";
    title.append(
      node("strong", i === 0 ? "Your creature" : "Opponent"),
      node("span", short(f.identity.seed)),
    );
    section.append(title);
    if (f.profile.absolute) {
      section.append(node("p", "No finite ratings."));
      continue;
    }
    for (const [label, value, max, cls] of [
      ["Health", v.hp, f.maxHP, ""],
      ["Energy", v.energy, f.maxEnergy, "energy"],
    ]) {
      const text = node("p", `${label} ${value} / ${max}`);
      text.className = "meter-label";
      const meter = node("progress");
      meter.max = max;
      meter.value = value;
      meter.className = cls;
      meter.setAttribute(
        "aria-label",
        (i === 0 ? "Your " : "Opponent ") + label.toLowerCase(),
      );
      section.append(text, meter);
    }
    const tags = [];
    if (v.sleep) tags.push(`Asleep · ${v.sleep} turn(s)`);
    if (v.poison) tags.push(`Irritated · ${v.poison}`);
    if (v.slow) tags.push(`Slowed · ${v.slow}`);
    if (v.focus) tags.push(`Focused · ${v.focus}`);
    const text = node("p", tags.join(" / ") || "Awake · ready");
    text.className = "status-tags";
    section.append(text);
  }
}
function comparison() {
  const root = $("comparison-content");
  root.replaceChildren();
  if (state.fighters.some((f) => f.profile.absolute)) {
    root.append(node("p", "A finite comparison is unavailable."));
    return;
  }
  const table = node("table"),
    head = node("tr");
  for (const t of ["Rating", "Your creature", "Opponent"])
    head.append(node("th", t));
  table.append(head);
  const stats = state.fighters.map((f) => effectiveStats(f, state));
  for (const [key, label] of Object.entries(STAT_NAMES)) {
    const tr = node("tr"),
      title = node("th", label);
    title.title = STAT_HELP[key];
    tr.append(title);
    for (let i = 0; i < 2; i++) {
      const cell = node("td");
      cell.append(
        node(
          stats[i][key] > stats[1 - i][key] ? "strong" : "span",
          Math.round(stats[i][key]) +
            (stats[i][key] > stats[1 - i][key] ? " ↑" : ""),
        ),
      );
      tr.append(cell);
    }
    table.append(tr);
  }
  root.append(
    table,
    node(
      "p",
      "Ratings above include the selected arena and current statuses. ↑ marks a higher rating, not a guaranteed winner.",
    ),
  );
  for (let i = 0; i < 2; i++) {
    const f = state.fighters[i],
      div = node("section");
    div.append(
      node("h3", i === 0 ? "Your creature" : "Opponent"),
      node("p", `${f.ecology.cycle} · ${f.ecology.sleepWindow}.`),
    );
    for (const note of conditions(f, state.environment).notes)
      div.append(node("p", note));
    for (const id of f.profile.abilities)
      div.append(
        node("p", ABILITIES[id].name + " — " + ABILITIES[id].description),
      );
    root.append(div);
  }
}
function logEvent(e) {
  const who = e.actor === 0 ? "You" : "Opponent",
    move = ACTIONS[e.action]?.name ?? "Round end";
  let text = `${e.round}. ${who} · ${move}`;
  if (e.hit === false) text += " — missed";
  if (e.damage)
    text +=
      e.action === "upkeep"
        ? ` — takes ${e.damage} irritation damage`
        : ` — deals ${e.damage} damage${e.critical ? " (critical)" : ""}`;
  if (e.healing) text += ` · heals ${e.healing}`;
  if (e.recoil) text += ` · takes ${e.recoil} reflected damage`;
  if (e.ability.length)
    text +=
      " · " +
      [...new Set(e.ability)].map((id) => ABILITIES[id].name).join(", ");
  if (e.notes.length) text += " · " + e.notes.join(" ");
  // Quiet energy regeneration is already visible in the energy bar.
  if (e.action !== "upkeep" || e.damage || e.healing || e.ability.length)
    $("events").append(node("li", text));
  $("events").scrollTop = $("events").scrollHeight;
}
function update() {
  if (!state) return;
  health();
  comparison();
  $("begin").hidden = active;
  $("autoplay").hidden = !active || state.finished;
  $("reset").disabled = busy;
  $("play-area").hidden = !active || state.finished;
  $("copy-encounter").disabled = busy;
  $("copy-encounter").textContent = history.length
    ? "Copy replay link"
    : "Copy encounter link";
  $("round-status").textContent = busy
    ? `Round ${state.round} · playing…`
    : state.finished
      ? state.winner === null
        ? state.reason === "round-limit"
          ? "Draw · 60-round limit"
          : state.reason === "identical"
            ? "Identical specimens · draw"
            : "Draw"
        : `${state.winner === 0 ? "Your creature wins" : "Opponent wins"}${state.reason === "absolute" ? " · no finite contest" : ` · round ${state.round}`}`
      : !active
        ? "Ready to begin"
        : busy
          ? `Round ${state.round} · playing…`
          : `Round ${state.round + 1} · ${replayAt < replay.length ? "recorded moves ready" : "your move"}`;
  $("begin").disabled = state.finished;
  if (state.finished) pause();
  const moves = availableActions(state, 0).filter(
    (m) => !m.internal || state.fighters[0].sleep,
  );
  if (state.fighters[0].sleep) selected = "sleep";
  else if (selected === "sleep") selected = "strike";
  $("moves").replaceChildren();
  for (const m of moves) {
    const b = node("button");
    b.type = "button";
    b.dataset.move = m.id;
    b.setAttribute("aria-pressed", String(selected === m.id));
    const title = node("span");
    title.className = "move-title";
    title.append(node("span", m.name), node("small", m.cost + " energy"));
    b.append(title, node("small", m.available ? m.description : m.reason));
    b.disabled = busy || auto || replayAt < replay.length;
    b.addEventListener("click", () => {
      selected = m.id;
      update();
    });
    $("moves").append(b);
  }
  const m = ACTIONS[selected],
    check = actionAvailability(state, 0, selected);
  $("move-explanation").textContent =
    `${m.name} · ${m.cost} energy. ${m.description}${check.available ? "" : " " + check.reason}`;
  const recorded = replayAt < replay.length;
  $("play-round").textContent = recorded
    ? "Play recorded round"
    : selected === "sleep"
      ? "Pass one sleeping turn"
      : `Use ${m.name} · play one round`;
  $("play-round").disabled = busy || auto || (!recorded && !check.available);
  $("autoplay").textContent = auto
    ? "Pause after this round"
    : recorded
      ? "Play recorded rounds"
      : "Autoplay";
}
async function preview(loadedReplay = []) {
  pause();
  const token = ++generation;
  arena?.cancel();
  arena = null;
  state = null;
  active = false;
  busy = false;
  records = null;
  $("encounter").hidden = true;
  document.body.classList.remove("playing");
  $("notice").textContent = "Preparing creatures…";
  try {
    const nextRecords = [$("left-seed").value, $("right-seed").value].map(
      (seed, i) => generate(seed, { generatorVersion: versions[i] }),
    );
    const nextOptions = {
      battleSeed: $("encounter-code").value,
      terrain: $("terrain").value,
      time: $("time").value,
    };
    const nextState = createBattle(...nextRecords, nextOptions);
    // Validate a replay completely before showing it. Never silently substitute actions.
    let validation = nextState;
    for (const pair of loadedReplay) {
      if (validation.finished)
        throw new Error("Replay contains moves after the battle ended.");
      validation = stepBattle(validation, ...pair);
    }
    const nextArena = await createArena(
      $("arena"),
      nextRecords,
      nextState.environment,
      { isCancelled: () => token !== generation },
    );
    if (token !== generation) {
      nextArena.cancel();
      return;
    }
    records = nextRecords;
    options = nextOptions;
    state = nextState;
    arena = nextArena;
    history = [];
    replay = loadedReplay;
    replayAt = 0;
    $("events").replaceChildren();
    $("encounter").hidden = false;
    $("conditions").textContent =
      `${TERRAINS[state.environment.terrain].name} · ${TIMES[state.environment.time]} — ${TERRAINS[state.environment.terrain].description}`;
    $("notice").textContent = loadedReplay.length
      ? `Replay ready: ${loadedReplay.length} recorded round(s). Start to watch; no moves have played yet.`
      : "Review conditions and ratings, then start. You control the left creature.";
    $("back-link").href = routeURL(
      records[0].identity,
      new URL("index.html", location.href).href,
    );
    update();
  } catch (e) {
    if (token === generation) {
      $("notice").textContent = e.message;
      $("encounter").hidden = true;
      state = null;
      records = null;
    }
  }
}
async function playRound() {
  if (!state || state.finished || busy || !active) return;
  const token = generation,
    recorded = replayAt < replay.length;
  const pair = recorded
    ? replay[replayAt]
    : [auto ? chooseAction(state, 0) : selected, chooseAction(state, 1)];
  const previous = state;
  try {
    const next = stepBattle(state, ...pair),
      events = next.log.slice(state.log.length);
    busy = true;
    state = next;
    update();
    health(previous.fighters);
    if (!auto && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      $("arena").scrollIntoView({ block: "center", behavior: "smooth" });
    for (const event of events) {
      await arena.play(event);
      if (token !== generation) return;
      health(event.snapshot);
      logEvent(event);
    }
    history.push(pair);
    if (recorded) replayAt++;
    if (recorded && replayAt === replay.length) {
      pause();
      $("notice").textContent =
        "Recorded rounds complete. You can now continue this encounter yourself.";
    }
    busy = false;
    update();
    if (auto && !state.finished) timer = setTimeout(playRound, 550);
  } catch (e) {
    if (token === generation) {
      busy = false;
      pause();
      $("notice").textContent = e.message;
      update();
    }
  }
}
$("setup").addEventListener("submit", (e) => {
  e.preventDefault();
  preview();
});
for (const id of [
  "left-seed",
  "right-seed",
  "terrain",
  "time",
  "encounter-code",
])
  $(id).addEventListener("input", () => {
    if (id === "left-seed") versions[0] = 2;
    if (id === "right-seed") versions[1] = 2;
    invalidate();
  });
$("new-code").addEventListener("click", () => {
  $("encounter-code").value = freshCode();
  invalidate();
});
$("help-toggle").addEventListener("click", () => {
  $("help").open = !$("help").open;
});
$("begin").addEventListener("click", () => {
  active = true;
  $("setup-panel").open = false;
  document.body.classList.add("playing");
  $("notice").textContent =
    "Choose a move below. You control the left creature.";
  update();
});
$("play-round").addEventListener("click", playRound);
$("reset").addEventListener("click", () => preview(replay));
$("autoplay").addEventListener("click", () => {
  if (auto) {
    pause();
    update();
  } else {
    auto = true;
    update();
    playRound();
  }
});
$("copy-encounter").addEventListener("click", async () => {
  if (!records) return;
  const link = duelURL(...records, options, history, location.href);
  try {
    await navigator.clipboard.writeText(link);
    $("notice").textContent = history.length
      ? "Replay link copied. It includes the rounds already played."
      : "Encounter link copied. It includes the fighters, code and arena settings.";
  } catch {
    const input = node("input");
    input.value = link;
    input.readOnly = true;
    $("notice").replaceChildren(node("span", "Copy this link: "), input);
    input.select();
  }
});
for (const [heading, entries] of [
  [
    "Ratings",
    Object.entries(STAT_NAMES).map(([id, name]) => ({
      name,
      description: STAT_HELP[id],
    })),
  ],
  ["Moves", Object.values(ACTIONS)],
  ["Passive abilities", Object.values(ABILITIES)],
]) {
  $("manual-content").append(node("h3", heading));
  const grid = node("div");
  grid.className = "ability-grid";
  for (const item of entries) {
    const p = node("p");
    p.append(
      node("strong", item.name + " — "),
      document.createTextNode(item.description),
    );
    grid.append(p);
  }
  $("manual-content").append(grid);
}
window.addEventListener("pagehide", () => {
  pause();
  generation++;
  arena?.cancel();
});
try {
  const linked = parseDuelURL(location.href);
  if (linked) {
    $("left-seed").value = linked.left;
    $("right-seed").value = linked.right;
    versions = [linked.options.leftVersion, linked.options.rightVersion];
    $("encounter-code").value = linked.options.battleSeed;
    $("terrain").value = linked.options.terrain;
    $("time").value = linked.options.time;
    preview(linked.history);
  } else preview();
} catch (e) {
  $("notice").textContent = e.message;
}