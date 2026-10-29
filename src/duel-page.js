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
import { randomSeed } from "./random.js";
import { randomOpponent, freshCode } from "./duel-opponents.js";
import {
  MAIN_MOVES,
  EXTRA_MOVES,
  MOVE_KEYS,
  MOVE_NOTES,
  battleAdvice,
} from "./duel-advice.js";
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
const recentOpponents = [];
const labelButton = (id, text, key) => {
  const button = $(id);
  button.replaceChildren(node("span", text));
  if (key) {
    button.append(node("kbd", key));
    button.setAttribute("aria-keyshortcuts", key);
  }
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
  labelButton(
    "autoplay",
    replayAt < replay.length ? "Watch replay" : "Auto",
    "A",
  );
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
    "Seeds changed. Select Use these creatures to apply them.";
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
      node("span", "seed " + short(f.identity.seed)),
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
    if (v.focus) tags.push(`Focused · ${v.focus} boosted attacks`);
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
  if (e.action !== "upkeep" || e.damage || e.healing || e.ability.length)
    $("events").append(node("li", text));
  $("events").scrollTop = $("events").scrollHeight;
}
function update() {
  if (!state) return;
  const focusMove = document.activeElement?.dataset.move;
  health();
  comparison();
  $("begin").hidden = active || state.finished;
  $("play-round").hidden = !active;
  $("autoplay").hidden = !active || state.finished;
  $("reset").disabled = busy || auto;
  $("new-opponent").disabled = busy || auto;
  $("play-area").hidden = state.finished;
  $("result-tip").hidden = !state.finished;
  $("copy-encounter").disabled = busy;
  $("copy-encounter").textContent = history.length
    ? "Share replay"
    : "Share fight";
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
        : `Round ${state.round + 1} · ${replayAt < replay.length ? "recorded moves ready" : "your move"}`;
  $("begin").disabled = state.finished || busy;
  if (state.fighters.some((f) => f.profile.absolute) || state.finished)
    $("turn-order").textContent = "";
  else {
    const [you, foe] = state.fighters.map((f) => effectiveStats(f, state));
    $("turn-order").textContent =
      you.speed === foe.speed
        ? "Equal speed · order varies"
        : you.speed > foe.speed
          ? "You act first"
          : "Opponent acts first";
  }
  if (state.finished) pause();
  const sleeping = !!state.fighters[0].sleep;
  if (sleeping) selected = "sleep";
  else if (selected === "sleep") selected = "strike";
  const moves = new Map(availableActions(state, 0).map((m) => [m.id, m]));
  $("moves").replaceChildren();
  $("extra-moves").replaceChildren();
  $("more-moves").hidden = sleeping;
  for (const [root, ids] of [
    ["moves", sleeping ? ["sleep"] : MAIN_MOVES],
    ["extra-moves", sleeping ? [] : EXTRA_MOVES],
  ]) {
    for (const id of ids) {
      const m = moves.get(id),
        b = node("button");
      b.type = "button";
      b.dataset.move = id;
      b.dataset.unavailable = String(!m.available);
      b.setAttribute("aria-pressed", String(selected === id));
      if (MOVE_KEYS[id]) b.setAttribute("aria-keyshortcuts", MOVE_KEYS[id]);
      const title = node("span");
      title.className = "move-title";
      title.append(node("span", m.name));
      if (MOVE_KEYS[id]) title.append(node("kbd", MOVE_KEYS[id].toUpperCase()));
      const note = node("span", MOVE_NOTES[id]);
      note.className = "move-note";
      const cost = node("span", m.available ? `${m.cost} energy` : m.reason);
      cost.className = "move-cost";
      b.append(title, note, cost);
      b.disabled = busy || auto || replayAt < replay.length;
      b.addEventListener("click", () => {
        selected = id;
        update();
      });
      $(root).append(b);
    }
  }
  const m = ACTIONS[selected],
    check = actionAvailability(state, 0, selected);
  $("move-explanation").textContent =
    `${m.name} · ${m.cost} energy. ${m.description}${check.available ? "" : " " + check.reason}`;
  $("combo-tip").textContent = battleAdvice(state, selected);
  const recorded = replayAt < replay.length;
  labelButton(
    "play-round",
    !active
      ? "Start fight"
      : recorded
        ? "Play recorded round"
        : selected === "sleep"
          ? "Pass one sleeping turn"
          : `Use ${m.name}`,
    "Enter",
  );
  $("play-round").disabled =
    busy || auto || state.finished || (!recorded && !check.available);
  labelButton(
    "autoplay",
    auto ? "Pause" : recorded ? "Watch replay" : "Auto",
    "A",
  );
  if (focusMove)
    document
      .querySelector(`[data-move="${focusMove}"]`)
      ?.focus({ preventScroll: true });
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
  $("new-opponent").disabled = true;
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
    const habitat = conditions(state.fighters[0], state.environment);
    const changes = Object.entries(habitat.bonuses)
      .filter(([, value]) => Math.abs(value - 1) >= 0.005)
      .map(
        ([key, value]) =>
          `${STAT_NAMES[key].toLowerCase()} ${value >= 1 ? "+" : ""}${Math.round((value - 1) * 100)}%`,
      );
    $("conditions").textContent =
      `${TERRAINS[state.environment.terrain].name} · ${TIMES[state.environment.time]} — your ${changes.join(", ") || "ratings are unchanged"}.`;
    $("conditions").title = TERRAINS[state.environment.terrain].description;
    $("last-event").textContent =
      "You play on the left. Choose a move each round; the computer chooses for the opponent.";
    recentOpponents.push(records[1].identity.seed);
    if (recentOpponents.length > 12) recentOpponents.shift();
    $("notice").textContent = loadedReplay.length
      ? `Replay ready: ${loadedReplay.length} recorded round(s). Start to watch; no moves have played yet.`
      : "";
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
      $("new-opponent").disabled = false;
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

    for (const event of events) {
      await arena.play(event);
      if (token !== generation) return;
      health(event.snapshot);
      logEvent(event);
      const latest = Array.from($("events").children)
        .slice(-2)
        .map((item) => item.textContent.replace(/^\d+\. /, ""));
      $("last-event").textContent = latest.join(" · ");
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
function beginDuel() {
  if (!state || state.finished || busy) return;
  active = true;
  $("setup-panel").open = false;
  $("notice").textContent =
    replayAt < replay.length
      ? "This is a replay. Play the recorded rounds to continue."
      : "";
  update();
}
function selectMove(id) {
  if (
    !state ||
    state.finished ||
    busy ||
    auto ||
    replayAt < replay.length ||
    state.fighters[0].sleep
  )
    return;
  selected = id;
  if (EXTRA_MOVES.includes(id)) $("more-moves").open = true;
  update();
}
function toggleAuto() {
  if (!state || state.finished || !active) return;
  if (auto) {
    pause();
    update();
  } else {
    auto = true;
    update();
    playRound();
  }
}
function toggleHelp(open = $("help").hidden) {
  $("help").hidden = !open;
  $("help-toggle").setAttribute("aria-expanded", String(open));
  if (open) {
    pause();
    update();
    $("help").scrollIntoView({ block: "start" });
    $("close-help").focus({ preventScroll: true });
  } else $("help-toggle").focus({ preventScroll: true });
}
async function newOpponent() {
  if (busy || auto) return;
  try {
    const left = generate($("left-seed").value || randomSeed(), {
      generatorVersion: versions[0],
    });
    const opponent = randomOpponent(left, { recent: recentOpponents });
    $("left-seed").value = left.identity.seed;
    $("right-seed").value = opponent.identity.seed;
    versions[1] = 2;
    $("encounter-code").value = freshCode();
    await preview();
  } catch (error) {
    $("notice").textContent = error.message;
  }
}
$("setup").addEventListener("submit", (e) => {
  e.preventDefault();
  preview();
});
for (const id of ["left-seed", "right-seed", "encounter-code"])
  $(id).addEventListener("input", () => {
    if (id === "left-seed") versions[0] = 2;
    if (id === "right-seed") versions[1] = 2;
    invalidate();
    $("new-opponent").disabled = false;
  });
for (const id of ["terrain", "time"])
  $(id).addEventListener("change", () => preview());
$("new-code").addEventListener("click", () => {
  $("encounter-code").value = freshCode();
  preview();
});
$("new-opponent").addEventListener("click", newOpponent);
$("help-toggle").addEventListener("click", () => toggleHelp());
$("close-help").addEventListener("click", () => toggleHelp(false));
$("begin").addEventListener("click", beginDuel);
$("play-round").addEventListener("click", () =>
  active ? playRound() : beginDuel(),
);
$("reset").addEventListener("click", () => preview(replay));
$("autoplay").addEventListener("click", toggleAuto);
document.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (
    event.target.isContentEditable ||
    event.target.closest?.("input, textarea, select, [role=textbox]")
  )
    return;
  const key = event.key.toLowerCase();
  if (key === "escape") {
    event.preventDefault();
    if (!$("help").hidden) toggleHelp(false);
    else {
      pause();
      update();
    }
    return;
  }
  if (key === "?") {
    event.preventDefault();
    toggleHelp();
    return;
  }
  if (!$("help").hidden) return;
  if (key === "n") {
    event.preventDefault();
    newOpponent();
    return;
  }
  if (key === "a") {
    event.preventDefault();
    toggleAuto();
    return;
  }
  if (key === "enter") {
    if (
      event.target.closest?.("form, a, summary") ||
      (event.target.closest?.("button") &&
        !event.target.closest("[data-move], #play-round, #begin"))
    )
      return;
    event.preventDefault();
    if (!auto) active ? playRound() : beginDuel();
    return;
  }
  const id = Object.keys(MOVE_KEYS).find((id) => MOVE_KEYS[id] === key);
  if (id) {
    event.preventDefault();
    selectMove(id);
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
  } else {
    $("left-seed").value = randomOpponent(generate("42")).identity.seed;
    newOpponent();
  }
} catch (e) {
  $("notice").textContent = e.message;
}
