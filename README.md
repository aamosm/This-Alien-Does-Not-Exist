<h1 align="center">This Alien Doesn't Exist</h1>

<p align="center">A procedural alien generator with deterministic seeds and trait-based search.</p>

<p align="center"><a href="https://thisaliendoesnotexist.app">Website</a> · <a href="https://github.com/aamosm/This-Alien-Does-Not-Exist">Source</a></p>

![The generator interface and observation panel](docs/images/site.png)

Generate aliens from seeds, then use those seeds to revisit them later. You can also search for specific traits instead of relying on random discovery. Generation and search run in the browser, so neither an account nor an external image model is needed.

## Run

Open `index.html` for offline use. To run the local server, including its JSON endpoints and CLI, install Node.js 22 or later and run:

```bash
npm start
```

**Quick** uses the lightweight renderer, while **Skin** adds surface detail and lighting.

Random discovery avoids the last ten silhouette clusters, so changing an alien's markings doesn't make an existing outline count as a new discovery. The generator also varies wing membranes by their sweep, chord and tip shape. Body, head and limb construction vary with the position within each genome choice interval, giving aliens in the same body family more anatomical variation.

These changes affect the current generator's appearances at existing seeds, but the original generator remains unchanged.

## Search

Use **Search & filters** to combine traits. For example, you could look for aliens with exactly four eyes, a spotted skin pattern and a colour close to `120`:

1. Eyes → Exactly → `4`
2. Skin pattern → Is → `Spots`
3. Colour → About → `120`

Select **Find matches** to see the results and which traits each one matched. Some geometric constraints conflict with one another, so a result may be an approximate match rather than satisfy every constraint exactly.

![Trait search with examples and results](docs/images/search.png)

**Start from the alien on screen** searches for visibly different relatives. Enable **Keep the same body type** to stay within the current anatomy family; turn it off to explore different body and head modules.

The solver varies proportions and compares outlines, which helps distinguish aliens with similar anatomy instead of returning near-identical copies that only differ in paint or texture. Restrictive filters can still leave you with fewer results.

Search links can be shared, and the JSON editor accepts the same query format as the API.

Search builds genomes from the requested traits rather than scanning random seeds. See [REVERSE.md](docs/REVERSE.md) for how the method works and where it has limitations.

## Combat

Choose **Duel ↗** to open the dedicated [arena](duel.html). Keeping combat on its own page leaves the generator's interface largely untouched; the arena has room for both creatures, animated attacks, health and energy bars, move explanations and a round log. The built `duel.html` also works offline, and its tab icon follows your selected creature.

1. The creature you were viewing comes with you, and the game finds an opponent. **New opponent** or **N** keeps your creature and finds another. To fight specific creatures, expand **Choose specific creatures** and paste their seeds.
2. Choose terrain and time above the fight, or leave them random. The line under the arena shows how the conditions affect your creature. **Stats & abilities** has the full comparison. Both creatures' passive abilities stay visible under their health bars.
3. Select **Start fight**, choose a move, then press **Enter** or its Use button. **1–6** select the six main moves. **Q W E R T Y U** select the seven under **More moves**. Both creatures choose before either attacks; the faster creature acts first, and Guard protects for the entire round.
4. Hover or focus a move to inspect its cost, power and base accuracy beside the battlefield. Move hints explain useful sequences as you play. Focus strengthens your next two attacks, so try it before Strike or Lunge. Irritant spray followed by Guard keeps irritation working while you defend. Breathe restores energy; Rest heals but puts you to sleep for two turns.
5. **Auto / A** plays visible rounds; **Esc** pauses. **Rematch** repeats the same setup. **Share replay** includes the moves already played so someone else can watch and continue. **?** opens help. Shortcuts stay off while you are typing.

The creature seed determines the creature; the encounter code determines chance rolls and any arena choices left to the game. The code is not a strength level, and changing it doesn't change either creature.

With the same creatures, encounter code, terrain, time, combat rules and actions, the duel produces the same outcome. Different actions can produce a different result, while a new encounter code changes the rolls without requiring different creatures.

There are **13 selectable moves and 24 passive abilities**. Each finite creature receives two deterministically selected passives, and all 24 have implemented effects. The mechanics take inspiration from familiar turn-based RPGs without using elemental types or attempting to reproduce another game's entire ability catalogue.

Ordinary creatures have a shared budget of 800 stat points, so their ratings involve trade-offs rather than every stat being maximised. Activity preferences for day, night and dusk, along with moisture preference, cover and support proportions, provide modest environmental advantages. These affect combat performance; being active at the wrong time does not automatically put a creature to sleep. Creatures start awake.

Battles end after 60 rounds. Healing is halved after round 30 and disabled after round 45 to limit recovery loops. Human progression and the final circle have their own rules. [COMBAT.md](docs/COMBAT.md) documents the formulas, moves, abilities and exceptions.

The API supports calls such as `duel('42', '17', {battleSeed: 'field-7', terrain: 'wetland', time: 'night'})`. Interactive clients can also import `createBattle`, `stepBattle` and `availableActions` from `alien-api.js`.

Imported creature records have their ratings regenerated from their identity, rather than being allowed to supply their own combat stats. These battles are local simulations, not an authenticated competitive service.

## Seeds and saves

A creature's identity is `generatorVersion + seed`. The generator version matters because the same seed can produce different creatures under different versions: `?v=2&seed=42` opens the current generator, while `?v=1&seed=42` opens the original mapping.

The **Save…** menu exports the current creature as PNG or JSON, or saved discoveries as JSONL. Imports support both JSON and JSONL. Browser storage is optional, so export your discoveries before clearing browser data if you need to keep them.

## JavaScript API

`alien-api.js` is a dependency-free ES module. For example, you can generate an alien, search for creatures matching a trait and find anatomical relatives:

```js
import { generate, search, closest } from './alien-api.js';

const alien = generate('42', { generatorVersion: 2 });

const matches = await search({
  constraints: [{ field: 'eyeCount', op: 'eq', value: 4 }],
  limit: 6
});

const relatives = await closest(alien.identity.seed, {
  category: 'anatomy'
});
```

See [API.md](docs/API.md) for the available query fields, response formats and server routes. GitHub Pages supports the module and the browser-based `api.html` bridge, but it cannot run the Node HTTP endpoints.

## Develop

```bash
npm ci
npx playwright install chromium
npm run build
npm test
npm run test:browser
npm run audit
```

`npm run package` creates `dist/This-Alien-Does-Not-Exist.zip`.

For GitHub Pages, publish `index.html`, `duel.html`, `404.html`, `.nojekyll`, `alien-api.js`, `api.html` and `LICENSE`. Keep `CNAME` only when using the custom domain.

## License

[MIT](LICENSE), retaining `Copyright (c) 2026 DHC`.