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

`generate` and compact records include `combat: {ruleset, absolute, stats, budget, abilities}`. `schema().combat` lists the eight stats, actions and passives. `duel(leftSeed, rightSeed, {leftVersion: 2, rightVersion: 2, battleSeed: "0"})` regenerates both fighters and returns a deterministic auto-resolved battle.

- `/api/duel?left=42&right=3&battle=0` runs on the local Node server.
- `api.html?op=duel&left=42&right=3` computes in the browser on static hosting.
- Each side accepts either `left`/`right` or compact `leftPi`/`rightPi`; use `lv` and `rv` for generator versions. Duplicate or ambiguous identities are rejected.
- `request({op: "duel", left: "42", right: "3", options: {battleSeed: "example"}})` also works through the iframe bridge.
- `src/combat.js` exports `createBattle(recordA, recordB)`, immutable `stepBattle(state, leftAction, rightAction)`, `chooseAction(state, side)` and `finishBattle(state)` for interactive clients. Actions omitted from a step are selected by the AI from the preceding state.

Battle output contains fighters, remaining health/energy, round, structured action log, `finished`, `winner` (0, 1, or null for a draw), and `reason`. Maximum duration is 40 rounds. `combat.ruleset` versions the game rules separately from generator identity. Stats are derived outputs, not new inverse-search filters.
