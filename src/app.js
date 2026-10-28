import { queryURL } from "./api.js";
import { parseRoute, routeURL } from "./routes.js";
import { seedString } from "./random.js";
import { generate, catalogueRecord } from "./engine.js";
import { render } from "./render.js";
import { renderSkin } from "./skin-render.js";
import { FIELDS, recordID } from "./registry.js";
import {
  solveQuery,
  normalizeQuery,
  LABELS,
  OPTIONS,
  UNITS,
  COUNTS,
} from "./inverse.js";
import { DiscoveryPicker } from "./discovery.js";
import { renderPi } from "./pi-render.js";
import { renderLegacy } from "../legacy/render.js";
import { SeedLimitError, OVER_LIMIT } from "./pi.js";
import { CatalogueStore } from "./storage.js";

const initialURL = location.href;
const $ = (id) => document.getElementById(id),
  canvas = $("alienCanvas"),
  ctx = canvas.getContext("2d");
const store = new CatalogueStore(),
  saved = new Map(),
  cache = new Map();
let current = null,
  lastSize = 0,
  resizeTimer,
  job = null,
  jobID = 0,
  storageReady = false,
  skinWorker = null,
  skinURL = null,
  renderID = 0;
let deck;
try {
  deck = new DiscoveryPicker(
    JSON.parse(sessionStorage.getItem("alien-discovery-deck") || "{}"),
  );
} catch {
  deck = new DiscoveryPicker();
}
function rememberDiscovery(record) {
  deck.remember(record);
  try {
    sessionStorage.setItem(
      "alien-discovery-deck",
      JSON.stringify(deck.snapshot()),
    );
  } catch {}
}
function el(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
function updateStorage() {
  const n = saved.size;
  $("saved-count").textContent =
    `${n} ${n === 1 ? "discovery" : "discoveries"}`;
  $("storage-status").textContent =
    store.warning ||
    "Discoveries are saved in this browser. Export to keep a portable copy.";
}
function showRecord(record) {
  const panel = $("record-panel");
  panel.replaceChildren();
  panel.style.opacity =
    record.kind === "pi-path" ? Math.sqrt(1 - record.pi.t) : "1";
  $("specimen-id").textContent =
    record.identity.seed.length > 32
      ? record.identity.seed.slice(0, 16) + "…" + record.identity.seed.slice(-8)
      : record.identity.seed;
  $("specimen-id").title = record.identity.seed;
  for (const section of [...new Set(record.claims.map((c) => c.section))]) {
    const d = el("details", undefined, "data-section");
    d.open = ["Morphology", "Surface"].includes(section);
    d.append(el("summary", section, "data-header"));
    for (const claim of record.claims.filter((c) => c.section === section)) {
      const p = el("p", undefined, "claim");
      if (claim.kind === "Model") p.append(el("span", "Model:", "kind"));
      p.append(document.createTextNode(claim.text));
      d.append(p);
      const evidence = el("details", undefined, "evidence");
      evidence.append(el("summary", "Evidence"));
      for (const e of claim.evidence)
        evidence.append(el("div", `${e.path}: ${e.value ?? "unknown"}`));
      d.append(evidence);
    }
    panel.append(d);
  }
  canvas.setAttribute(
    "aria-label",
    `${record.measurements.bodyPlan} with ${record.measurements.eyeCount} eyes. Activate to discover another alien.`,
  );
}
let faviconID = 0;
async function updateFavicon(record) {
  const id = ++faviconID,
    icon = document.createElement("canvas");
  icon.width = icon.height = 64;
  if (record.kind === "pi-path")
    await renderPi(icon.getContext("2d"), record, 64, 64, { quick: true });
  else render(icon.getContext("2d"), record, 64, 64, { background: false });
  if (id === faviconID && current === record)
    $("alien-favicon").href = icon.toDataURL("image/png");
}
function stopSkin() {
  skinWorker?.terminate();
  skinWorker = null;
  if (skinURL) URL.revokeObjectURL(skinURL);
  skinURL = null;
}
function paint() {
  if (!current) return;
  stopSkin();
  const id = ++renderID,
    record = current,
    skin = $("render-mode").value === "skin";
  const size = Math.max(
    280,
    Math.min(
      skin ? 640 : 960,
      Math.round(
        canvas.getBoundingClientRect().width *
          Math.min(devicePixelRatio || 1, 1.5),
      ),
    ),
  );
  canvas.width = canvas.height = size;
  lastSize = size;
  if (record.kind === "pi-path" || record.generatorVersion === 1) {
    canvas.setAttribute("aria-busy", "true");
    $("save-download").disabled = true;
    $("open-save").disabled = false;
    const back = document.createElement("canvas");
    back.width = back.height = size;
    const operation =
      record.kind === "pi-path"
        ? renderPi(back.getContext("2d"), record, size, size, {
            isCancelled: () => id !== renderID,
            quick: !skin,
          })
        : renderLegacy(
            back.getContext("2d"),
            record.identity.seed,
            size,
            size,
            { isCancelled: () => id !== renderID },
          );
    operation
      .then(() => {
        if (id !== renderID) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(back, 0, 0);
        canvas.setAttribute("aria-busy", "false");
        $("save-download").disabled = false;
        status("");
      })
      .catch((e) => {
        if (e.name !== "AbortError" && id === renderID) {
          status(e.message, true);
          canvas.setAttribute("aria-busy", "false");
        }
      });
    return;
  }
  render(ctx, record, size, size);
  canvas.setAttribute("aria-busy", String(skin));
  $("save-download").disabled = skin;
  $("open-save").disabled = false;
  if (!skin) {
    status("");
    return;
  }
  status("Rendering skin…");
  const done = (image) => {
    if (id !== renderID) {
      image?.close?.();
      return;
    }
    ctx.drawImage(image, 0, 0);
    image?.close?.();
    canvas.setAttribute("aria-busy", "false");
    $("save-download").disabled = false;
    status("");
    stopSkin();
  };
  const fallback = async () => {
    stopSkin();
    try {
      const back = document.createElement("canvas");
      back.width = back.height = size;
      await renderSkin(back.getContext("2d"), record, size, size, {
        isCancelled: () => id !== renderID,
      });
      if (id === renderID) done(back);
    } catch (e) {
      if (e.name !== "AbortError" && id === renderID) {
        canvas.setAttribute("aria-busy", "false");
        $("save-download").disabled = false;
        status("Skin rendering failed; quick preview is available.", true);
      }
    }
  };
  try {
    skinURL = URL.createObjectURL(
      new Blob([__SKIN_WORKER__], { type: "text/javascript" }),
    );
    skinWorker = new Worker(skinURL);
    skinWorker.onmessage = ({ data }) => {
      if (id !== renderID) {
        data.bitmap?.close();
        return;
      }
      if (data.type === "image") done(data.bitmap);
      else fallback();
    };
    skinWorker.onerror = () => {
      if (id === renderID) fallback();
    };
    skinWorker.postMessage({ record, size });
  } catch {
    fallback();
  }
}
$("render-mode").addEventListener("change", () => {
  try {
    localStorage.setItem("alien-render-mode", $("render-mode").value);
  } catch {}
  paint();
});
try {
  if (localStorage.getItem("alien-render-mode") === "quick")
    $("render-mode").value = "quick";
} catch {}
function navigate(
  seed,
  { push = true, generatorVersion = current?.generatorVersion ?? 2 } = {},
) {
  seed = seedString(seed, `v${generatorVersion}`);
  const key = `${generatorVersion}:${seed}`;
  let record = cache.get(key);
  if (!record) {
    record = generate(seed, { generatorVersion });
    cache.set(key, record);
    while (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  current = record;
  rememberDiscovery(record);
  $("seedInput").value = seed;
  $("canvas-message").hidden = true;
  canvas.hidden = false;
  $("seedInput").removeAttribute("aria-invalid");
  showRecord(record);
  updateFavicon(record);
  paint();
  const url = routeURL(record.identity, location.href);
  try {
    if (push && url !== location.href) history.pushState({ seed }, "", url);
    else history.replaceState({ seed }, "", url);
  } catch {}
  const compact = catalogueRecord(record);
  saved.set(recordID(compact), compact);
  updateStorage();
  if (storageReady)
    store
      .put(compact)
      .then(updateStorage)
      .catch(() => updateStorage());
}
function attempt(seed, options) {
  try {
    navigate(seed, options);
  } catch (error) {
    $("seedInput").setAttribute("aria-invalid", "true");
    if (error instanceof SeedLimitError) showLimit();
    else status(error.message, true);
  }
}
function showLimit() {
  stopSkin();
  ++renderID;
  current = null;
  ++faviconID;
  $("alien-favicon").href = "data:,";
  canvas.hidden = true;
  $("canvas-message").hidden = false;
  $("canvas-message").textContent = OVER_LIMIT;
  $("record-panel").replaceChildren();
  $("specimen-id").textContent = "—";
  $("open-save").disabled = $("save-download").disabled = true;
  status("");
}
function discover() {
  try {
    const record = deck.next();
    cache.set(`2:${record.identity.seed}`, record);
    attempt(record.identity.seed, { generatorVersion: 2 });
  } catch (error) {
    status(error.message, true);
  }
}
$("navigation").addEventListener("submit", (e) => {
  e.preventDefault();
  attempt($("seedInput").value);
});
canvas.addEventListener("click", discover);
canvas.addEventListener("keydown", (e) => {
  if (["Enter", " "].includes(e.key)) {
    e.preventDefault();
    discover();
  }
});
addEventListener("popstate", () => {
  try {
    const route = parseRoute(location.href);
    attempt(route?.seed || deck.next().identity.seed, {
      push: false,
      generatorVersion: route?.generatorVersion ?? 2,
    });
  } catch (error) {
    status(error.message, true);
  }
});
addEventListener("hashchange", () => {
  try {
    const id = parseRoute(location.href);
    if (
      id &&
      (id.seed !== current?.identity.seed ||
        id.generatorVersion !== current?.generatorVersion)
    )
      attempt(id.seed, { push: false, generatorVersion: id.generatorVersion });
  } catch (error) {
    status(error.message, true);
  }
});
const resize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (
      current &&
      Math.abs(
        Math.min(
          $("render-mode").value === "skin" ? 640 : 960,
          Math.round(
            canvas.getBoundingClientRect().width *
              Math.min(devicePixelRatio || 1, 1.5),
          ),
        ) - lastSize,
      ) > 20
    )
      paint();
  }, 150);
};
if (typeof ResizeObserver !== "undefined")
  new ResizeObserver(resize).observe(canvas.parentElement);
else addEventListener("resize", resize);
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("copy-link").addEventListener("click", async () => {
  if (!current) return;
  const link = routeURL(current.identity, location.href);
  try {
    await navigator.clipboard.writeText(link);
    status("Link copied.");
  } catch {
    status(`Copy: ${link}`);
  }
});
function artifactStem(record) {
  const seed = record.identity.seed;
  return record.pi
    ? `alien-pi-${record.pi.m}`
    : `alien-g${record.generatorVersion}-${seed.length > 40 ? seed.slice(0, 20) + "-" + seed.slice(-12) : seed}`;
}
$("open-save").addEventListener("click", () => $("save-dialog").showModal());
$("close-save").addEventListener("click", () => $("save-dialog").close());
$("save-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!current) return;
  const format = $("save-format").value;
  if (format === "image")
    canvas.toBlob((blob) => {
      if (blob) download(blob, `${artifactStem(current)}.png`);
    }, "image/png");
  else if (format === "record")
    download(
      new Blob([JSON.stringify(current, null, 2)], {
        type: "application/json",
      }),
      `${artifactStem(current)}.json`,
    );
  else
    download(
      new Blob(
        [[...saved.values()].map((r) => JSON.stringify(r)).join("\n") + "\n"],
        { type: "application/x-ndjson" },
      ),
      "alien-discoveries.jsonl",
    );
  $("save-dialog").close();
});
let machineQuery = null;
function updateQuery() {
  machineQuery = null;
  const isLike = $("like-current").checked;
  const matchCat =
    $("match-category-wrap") || $("match-category")?.closest("label");
  if (matchCat) matchCat.hidden = !isLike;
  $("phenotype-wrap").hidden = !isLike || current?.kind === "pi-path";
  $("find-matches").disabled = !$("filters").children.length && !isLike;
  $("like-description").textContent = isLike
    ? "Find visibly different relatives. Uncheck ‘Keep the same body type’ for a wider range of anatomy."
    : "Unspecified traits can vary.";
}
function newFilter(initial = { field: "eyeCount", op: "eq", value: 4 }) {
  const row = el("div", undefined, "filter-row"),
    field = el("select"),
    op = el("select"),
    remove = el("button", "Remove");
  let value,
    help = el("p", "", "field-help");
  field.setAttribute("aria-label", "Characteristic");
  op.setAttribute("aria-label", "Comparison");
  remove.type = "button";
  for (const [group, title] of [
    ["anatomy", "Anatomy"],
    ["appearance", "Surface & shape"],
    ["ecology", "Environment & modelled behaviour"],
  ]) {
    const section = el("optgroup");
    section.label = title;
    for (const [key, spec] of Object.entries(FIELDS).filter(
      ([, f]) => f.group === group,
    )) {
      const o = el("option", LABELS[key]);
      o.value = key;
      section.append(o);
    }
    field.append(section);
  }
  field.value = initial.field;
  function sync(preset) {
    value?.remove();
    op.replaceChildren();
    const spec = FIELDS[field.value],
      numeric = ["number", "hue"].includes(spec.type);
    const choices = numeric
      ? [
          [
            COUNTS.has(field.value) ? "eq" : "near",
            COUNTS.has(field.value) ? "Exactly" : "About",
          ],
          ["min", "At least"],
          ["max", "At most"],
          ...(!COUNTS.has(field.value) ? [["eq", "Exactly"]] : []),
        ]
      : [["eq", "Is"]];
    for (const [key, text] of choices) {
      const o = el("option", text);
      o.value = key;
      op.append(o);
    }
    value = el(numeric ? "input" : "select");
    value.setAttribute("aria-label", "Value");
    if (numeric) {
      value.type = "number";
      value.step = "any";
      value.required = true;
      value.placeholder = spec.range.join(" to ");
      value.value =
        preset?.value ??
        (COUNTS.has(field.value) ? 2 : field.value === "hue" ? 120 : 0.5);
    } else
      for (const item of spec.type === "boolean"
        ? [true, false]
        : OPTIONS[field.value]) {
        const o = el(
          "option",
          typeof item === "boolean" ? (item ? "Yes" : "No") : item,
        );
        o.value = String(item);
        value.append(o);
      }
    if (preset) {
      value.value = String(preset.value);
      op.value = preset.op;
    }
    help.textContent = UNITS[field.value];
    row.insertBefore(value, remove);
    value.addEventListener("change", updateQuery);
  }
  row.append(field, op, remove, help);
  sync(initial);
  field.addEventListener("change", () => {
    sync();
    updateQuery();
  });
  op.addEventListener("change", updateQuery);
  remove.addEventListener("click", () => {
    row.remove();
    updateQuery();
  });
  row.getFilter = () => ({
    field: field.value,
    op: op.value,
    value:
      FIELDS[field.value].type === "boolean"
        ? value.value === "true"
        : ["number", "hue"].includes(FIELDS[field.value].type)
          ? Number(value.value)
          : value.value,
  });
  $("filters").append(row);
  updateQuery();
}
$("add-filter").addEventListener("click", () => newFilter());
$("like-current").addEventListener("change", updateQuery);
$("match-category").addEventListener("change", updateQuery);
$("same-phenotype").addEventListener("change", updateQuery);
$("open-search").addEventListener("click", () => {
  if (!$("filters").children.length) newFilter();
  $("search-dialog").showModal();
  updateQuery();
});
$("close-search").addEventListener("click", () => $("search-dialog").close());
$("search-dialog").addEventListener("close", () => {
  cancelJob();
});
for (const button of document.querySelectorAll("[data-preset]"))
  button.addEventListener("click", () => {
    $("filters").replaceChildren();
    $("like-current").checked = button.dataset.preset === "similar";
    if (button.dataset.preset === "eyes") {
      newFilter({ field: "eyeCount", op: "eq", value: 4 });
      newFilter({ field: "pattern", op: "eq", value: "Spots" });
    }
    if (button.dataset.preset === "wings") {
      newFilter({ field: "wingCount", op: "eq", value: 2 });
      newFilter({ field: "hue", op: "near", value: 240 });
    }
    updateQuery();
  });
const cancelled = () => new DOMException("Cancelled", "AbortError");
function cancelJob() {
  jobID++;
  job?.stop();
  job = null;
  $("cancel-search").hidden = true;
  $("results").setAttribute("aria-busy", "false");
}
function progress(data) {
  $("search-status").textContent =
    `Solving characteristics… ${data.done} / ${data.total}`;
}
async function localTask(data, id) {
  if (data.type === "solve")
    return solveQuery(data.query, {
      isCancelled: () => id !== jobID,
      onProgress: progress,
    });
  const records = [];
  for (let i = 0; i < data.identities.length; i++) {
    if (id !== jobID) throw cancelled();
    records.push(
      catalogueRecord(
        generate(data.identities[i].seed, {
          generatorVersion: data.identities[i].generatorVersion,
        }),
      ),
    );
    if (i % 25 === 24) await new Promise((r) => setTimeout(r, 0));
  }
  return { records };
}
async function task(data) {
  cancelJob();
  const id = jobID;
  $("cancel-search").hidden = false;
  $("results").setAttribute("aria-busy", "true");
  try {
    const result = await new Promise((resolve, reject) => {
      let worker,
        url,
        settled = false;
      const cleanup = () => {
        worker?.terminate();
        if (url) URL.revokeObjectURL(url);
      };
      const fallback = () => {
        if (settled) return;
        settled = true;
        cleanup();
        localTask(data, id).then(resolve, reject);
      };
      job = {
        stop: () => {
          settled = true;
          cleanup();
          reject(cancelled());
        },
      };
      try {
        url = URL.createObjectURL(
          new Blob([__CATALOGUE_WORKER__], { type: "text/javascript" }),
        );
        worker = new Worker(url);
        worker.onmessage = ({ data: response }) => {
          if (id !== jobID) return;
          if (response.type === "progress") {
            progress(response);
            return;
          }
          settled = true;
          cleanup();
          if (response.type === "error") reject(new Error(response.message));
          else resolve(response);
        };
        worker.onerror = fallback;
        worker.postMessage(data);
      } catch {
        fallback();
      }
    });
    if (id !== jobID) throw cancelled();
    return result;
  } finally {
    if (id === jobID) {
      job = null;
      $("cancel-search").hidden = true;
      $("results").setAttribute("aria-busy", "false");
    }
  }
}
function currentQuery() {
  return (
    machineQuery ??
    normalizeQuery({
      constraints: [...$("filters").children].map((row) => row.getFilter()),
      like: $("like-current").checked && current ? current.identity.seed : null,
      limit: 6,
      samePhenotype: $("same-phenotype").checked,
      generatorVersion:
        $("like-current").checked && current ? current.generatorVersion : 2,
      category: $("like-current").checked
        ? $("match-category").value
        : "traits",
    })
  );
}
const fmt = (value) =>
  typeof value === "number"
    ? Number(value.toFixed(4)).toString()
    : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : String(value);
async function runSearch() {
  $("results").replaceChildren();

  try {
    const query = currentQuery();
    $("query-json").value = JSON.stringify(query, null, 2);
    $("search-status").textContent = "Solving characteristics…";
    const data = await task({ type: "solve", query });

    for (const item of data.results) {
      const record = generate(item.record.identity.seed),
        m = record.measurements;
      const card = el("article", undefined, "result"),
        thumb = el("canvas"),
        content = el("div"),
        open = el("a", "Open alien");
      thumb.width = thumb.height = 140;
      thumb.setAttribute("aria-label", `${m.bodyPlan}, ${m.eyeCount} eyes`);
      if (record.kind === "pi-path")
        await renderPi(thumb.getContext("2d"), record, 140, 140, {
          quick: true,
        });
      else render(thumb.getContext("2d"), record, 140, 140);
      content.append(
        el(
          "strong",
          record.kind === "pi-path"
            ? "Related specimen"
            : item.exact
              ? "Matches your request"
              : "Closest found · some traits differ",
          item.exact || record.kind === "pi-path"
            ? "match-label"
            : "approx-label",
        ),
        el(
          "p",
          record.kind === "pi-path"
            ? `${m.bodyPlan} · ${m.eyeCount} eyes`
            : `${m.bodyPlan} · ${m.eyeCount} eyes · ${m.pattern.toLowerCase()} skin`,
        ),
      );
      const why = el("details"),
        list = el("ul");
      why.open = !item.exact && record.kind !== "pi-path";
      why.append(el("summary", "See matched traits"));
      for (const c of item.checks) {
        const line = el(
          "li",
          `${LABELS[c.field]}: ${fmt(c.actual)}${c.met ? " ✓" : ` — requested ${c.op === "min" ? "at least " : c.op === "max" ? "at most " : ""}${fmt(c.requested)}`}`,
          c.met ? "met" : "miss",
        );
        list.append(line);
      }
      if (!item.checks.length)
        list.append(
          el(
            "li",
            record.kind === "pi-path"
              ? "Closest related specimen."
              : item.category === "same phenotype"
                ? "Same body type; different anatomical proportions."
                : "Different body type; related traits.",
          ),
        );
      why.append(list);
      content.append(why);
      if (item.comparison && record.kind !== "pi-path")
        content.append(
          el(
            "p",
            `${(item.comparison.score * 100).toFixed(1)}% ${query.category === "appearance" || query.category === "ecology" ? "trait similarity" : "shape & trait similarity"}`,
            "score",
          ),
        );
      open.href = routeURL(record.identity, location.href);
      open.addEventListener("click", (e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        attempt(record.identity.seed, {
          generatorVersion: record.generatorVersion,
        });
        $("search-dialog").close();
        $("alienData").scrollTop = 0;
      });
      content.append(open);
      card.append(thumb, content);
      $("results").append(card);
    }
    $("search-status").textContent =
      data.status === "conflict"
        ? data.conflicts.join(" ")
        : `${data.results.filter((r) => r.exact).length} of ${data.results.length} constructed results match your request.${data.status === "approximate" ? " The closest found are shown below; a global closest match is not guaranteed." : ""}${data.diversity?.limited ? " Near-identical outlines were omitted. Broaden the filters or uncheck Keep the same body type for more variety." : ""}`;
  } catch (error) {
    if (error.name !== "AbortError")
      $("search-status").textContent = error.message;
  }
}
$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});
$("cancel-search").addEventListener("click", () => {
  cancelJob();
  $("search-status").textContent = "Search stopped.";
});
$("apply-query").addEventListener("click", () => {
  try {
    const query = normalizeQuery(JSON.parse($("query-json").value));
    $("filters").replaceChildren();
    for (const c of query.constraints) newFilter(c);
    $("like-current").checked = query.like === current?.identity.seed;
    $("same-phenotype").checked = query.samePhenotype;
    updateQuery();
    machineQuery = query;
    $("find-matches").disabled = false;
    runSearch();
  } catch (e) {
    $("search-status").textContent = `Query needs a correction: ${e.message}`;
  }
});
$("copy-query").addEventListener("click", async () => {
  try {
    const url = queryURL(currentQuery(), location.href);
    await navigator.clipboard.writeText(url);
    $("search-status").textContent = "Search link copied.";
  } catch (e) {
    $("search-status").textContent =
      `Copy: ${queryURL(currentQuery(), location.href)}`;
  }
});
$("import-catalogue").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024)
      throw new Error("Import files must be under 20 MiB.");
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
      parsed = Array.isArray(parsed)
        ? parsed
        : parsed.results
          ? parsed.results.map((r) => r.record)
          : [parsed];
    } catch {
      parsed = text
        .split(/\r?\n/)
        .filter((x) => x.trim())
        .map((x) => JSON.parse(x));
    }
    if (parsed.length > 10000)
      throw new Error("Import at most 10,000 records at a time.");
    const identities = parsed.map((r) => {
      const version =
        r.generatorVersion ??
        r.identity?.generatorVersion ??
        (r.identity?.version ? Number(r.identity.version.slice(1)) : 2);
      if (![1, 2].includes(version))
        throw new Error("Unknown generator version.");
      if (
        (r.identity?.generatorVersion !== undefined &&
          r.identity.generatorVersion !== version) ||
        (r.identity?.version && r.identity.version !== `v${version}`)
      )
        throw new Error("Conflicting generator versions.");
      return {
        generatorVersion: version,
        seed: seedString(r.identity?.seed ?? r.seed, `v${version}`),
      };
    });
    $("import-status").textContent = "Rebuilding imported records…";
    const result = await task({ type: "import", identities });
    await storageInit;
    await store.putMany(result.records);
    for (const r of result.records) saved.set(recordID(r), r);
    updateStorage();
    $("import-status").textContent =
      `Imported ${result.records.length} records.`;
  } catch (e) {
    if (e.name !== "AbortError")
      $("import-status").textContent = `Import rejected: ${e.message}`;
  }
});
updateQuery();
try {
  const route = parseRoute(location.href);
  navigate(route?.seed || deck.next().identity.seed, {
    push: false,
    generatorVersion: route?.generatorVersion ?? 2,
  });
} catch (error) {
  if (error instanceof SeedLimitError) showLimit();
  else status(error.message, true);
  if (!(error instanceof SeedLimitError))
    $("record-panel").textContent =
      "Enter a valid seed, or click the canvas to discover an entity.";
}
const storageInit = (async () => {
  await store.open();
  const old = await store.all();
  for (const r of old) if (!saved.has(recordID(r))) saved.set(recordID(r), r);
  const existing = new Set(old.map(recordID));
  for (const r of saved.values())
    if (!existing.has(recordID(r)))
      try {
        await store.put(r);
      } catch {
        break;
      }
  storageReady = true;
  updateStorage();
})();
addEventListener("pagehide", () => {
  cancelJob();
  stopSkin();
  ++renderID;
});
addEventListener("pageshow", (e) => {
  if (e.persisted) paint();
});

try {
  const params = new URLSearchParams(
    new URL(initialURL).protocol === "file:"
      ? new URL(initialURL).hash.slice(1)
      : new URL(initialURL).search,
  );
  if (params.has("q")) {
    const raw = params.get("q");
    if (raw.length > 24000) throw new Error("Query is too large.");
    const query = normalizeQuery(JSON.parse(raw));
    $("filters").replaceChildren();
    for (const c of query.constraints) newFilter(c);
    $("like-current").checked = !!query.like;
    $("same-phenotype").checked = query.samePhenotype;
    $("phenotype-wrap").hidden = !query.like || current?.kind === "pi-path";
    $("match-category-wrap").hidden = !query.like;
    $("match-category").value =
      query.category === "traits" ? "closest" : query.category;
    machineQuery = query;
    $("search-dialog").showModal();
    $("query-json").value = JSON.stringify(machineQuery, null, 2);
    runSearch();
  }
} catch (e) {
  $("search-status").textContent = e.message;
  $("search-dialog").showModal();
}
