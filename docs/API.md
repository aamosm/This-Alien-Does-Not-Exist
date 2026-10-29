# API

Build with `npm run build`. This creates `alien-api.js` (ES module) and `api.html` (browser/iframe bridge). Seeds are decimal **strings**.

## JavaScript

```js
import { generate, search, closest, schema } from './alien-api.js';

const alien = generate('42', { generatorVersion: 2 });
const result = await search({
  constraints: [
    { field: 'eyeCount', op: 'eq', value: 4 },
    { field: 'hue', op: 'near', value: 120, tolerance: 0.1 }
  ],
  limit: 6
});
const relatives = await closest('42', { category: 'anatomy', limit: 6 });
const fields = schema();
```

`generate` is synchronous; `search`, `closest` and `request` are asynchronous. `generatorVersion: 1` uses the original generator; inverse search uses version 2. Unsupported versions are errors. `compact: true` omits render geometry.

## Search query

A query accepts:

| Property | Meaning |
| --- | --- |
| `constraints` | Up to 80 rows, combined with AND. `filters` is an alias. |
| `like` | Seed to use as the starting phenotype. |
| `category` | `traits`, `closest`, `anatomy`, `appearance` or `ecology`. |
| `samePhenotype` | For `like` queries, lock the main anatomy modules; defaults to `true`. |
| `limit` | 1–12 results; defaults to 6. |
| `variant` | Choose different unconstrained inputs without scanning seeds. |

Each constraint is `{field, op, value, tolerance?, weight?}`. Operators are `eq`, `min`, `max` and `near`. `weight` affects approximation ranking, not whether a constraint is checked. Use actual booleans and finite numbers. See `schema().fields` for names, ranges, choices and units.

Results include `status` (`matched`, `approximate` or `conflict`), records, checks and the number of candidates evaluated. `exact` means the requested comparisons passed after regeneration; it does not prove global nearestness. See [REVERSE.md](REVERSE.md).

## URLs and HTTP

Use `routeURL()` and `queryURL()` to create creature and search links. Common links are `?v=2&seed=42`, `?v=1&seed=42` and `?v=2&q=<encoded query JSON>`.

With `npm start`, the Node server exposes:

| Endpoint | Parameters |
| --- | --- |
| `/api/schema` | None |
| `/api/generate` | `seed`; optional `v`, `compact` |
| `/api/search` | `q` with the query JSON, URL-encoded |
| `/api/closest` | `seed`; optional `v`, `category`, `limit` |

Requests support GET and HEAD. Invalid requests return HTTP 400; seeds above the supported ceiling return HTTP 422. The server does not save generated records to the browser catalogue.

Static hosts such as GitHub Pages cannot run these HTTP routes. Use the ES module directly or embed `api.html` and send it `postMessage` requests with `type: 'alien:request'`, an `id`, and a `request` object containing `op` and its arguments. Responses use `type: 'alien:response'` and the same ID. Fetching `api.html` alone returns HTML, not computed JSON.

Related searches accept `samePhenotype: false` to broaden structural modules. Ordinary search results suppress near-identical outlines, so `limit` is a maximum rather than a guaranteed count. The `diversity` object reports `duplicatesSkipped`, `minimumOutlineDistance` and `limited`. Current records include a normalized anatomy descriptor in `shapeSignature.anatomy`; imported records are regenerated before use.

## Combat

The current combat ruleset is **2**, independent of generator version. `generate` and compact records expose `combat: {ruleset, absolute, stats, budget, abilities}`. `schema().combat` lists ratings, actions, all 24 passives, five terrains, three times and the 60-round limit.

```js
import { generate, duel, createBattle, stepBattle, availableActions } from './alien-api.js';
const setup = { battleSeed: 'field-7', terrain: 'wetland', time: 'night' };
const final = duel('42', '17', setup); // automated simulation
let live = createBattle(generate('42'), generate('17'), setup);
console.log(availableActions(live, 0)); // costs, descriptions, availability and reasons
live = stepBattle(live, 'strike'); // opponent chooses from the preceding state
```

Options: `leftVersion` / `rightVersion` (for `duel`), `battleSeed` (non-empty string, maximum 64 characters, trimmed), `terrain` (`random`, `plain`, `wetland`, `dunes`, `forest`, `scree`), and `time` (`random`, `day`, `dusk`, `night`). Unknown conditions and duplicate URL parameters fail explicitly. There is no silent fallback for unaffordable moves.

- Local HTTP: `/api/duel?left=42&right=17&battle=field-7&terrain=wetland&time=night`.
- Static bridge: `api.html?op=duel&left=42&right=17&battle=field-7&terrain=wetland&time=night`.
- Request object: `{op: 'duel', left: '42', right: '17', options: {battleSeed: 'field-7', terrain: 'wetland', time: 'night'}}`.
- Each side accepts one of `left`/`leftPi` and `right`/`rightPi`; `lv` / `rv` preserve generator versions. Compact pi identifiers require the current generator.

`createBattle`, `stepBattle`, `chooseAction`, `availableActions`, `actionAvailability` and `effectiveStats` are exported for interactive clients. Steps are immutable. Illegal explicit choices throw without changing the input. Omitting an action asks the AI to choose; induced sleep may supersede a committed move and is logged as Sleep. The low-level state is caller-owned, not a secure multiplayer protocol.

Battle output includes resolved `environment`, fighters, statuses, cooldowns, health/energy, round and a structured log. Events include per-event snapshots for animation; `upkeep` records residual damage, healing and energy restoration. `finished`, `winner` (0 / 1 / null) and `reason` describe the result. Calls using an old combat state are rejected rather than silently reinterpreted.

The **playable page** is `duel.html`, not `/api/duel`. Its share links use `r=2`, creature identifiers, `battle`, `terrain`, `time` and optionally `moves`. Move pairs are hexadecimal indices into the exported ACTIONS insertion order, at most 60 pairs. File URLs use a fragment; hosted URLs use query parameters. `src/duel-links.js` builds and parses these links; the page validates the entire transcript before playing it. Incompatible rulesets and illegal transcripts are rejected. Same setup plus the same move sequence is reproducible; an encounter code alone does not predetermine a winner.

