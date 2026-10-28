# Combat rules

Combat is a local, deterministic game simulation. Ratings do not assert biological facts. There are no elemental types, type multipliers, levels to grind, purchases or server accounts. The default page stays a generator; Combat is collapsed, and Duel opens one dialog.

## Ratings and trade-offs

Ordinary specimens receive exactly **800 points across eight ratings**. Each rating starts at 40; the remaining 480 points are divided by positive anatomical weights and allocated with largest-remainder rounding. All outputs are finite. Broad/heavy bodies favor vitality, power and defense; reach and smaller mass favor speed; limbs and eyes favor dexterity; head proportions and exploration favor intellect. Caution, gravity, resources and moisture shift resolve and recovery. Improving one share reduces others. The precise bounded input normalizations and weights are in `combatProfile()` in `src/combat.js`.

| Rating | Gameplay effect |
|---|---|
| Vitality | Maximum health = round(180 + 2 × vitality). |
| Power | Strike damage. |
| Defense | Reduces strike and feint damage. |
| Dexterity | Accuracy, critical chance and feint damage. |
| Speed | First action each round and evasion. |
| Intellect | Feint damage, Focus strength and AI decision quality. |
| Resolve | Reduces the opponent's critical chance. |
| Recovery | Increases Recover healing. |

Two distinct passives are sampled deterministically from the seed, weighted by the square of their associated rating. This gives affinity without assigning every high-intellect specimen the same abilities. Each passive is a renamed, type-free adaptation of a familiar RPG battle mechanic; the descriptions here are the actual implemented rules.

| Passive | Rating affinity | Effect |
|---|---|---|
| Deep Reserve | Vitality | Maximum health +8%; starts with 125 energy instead of 100. |
| Last Ember | Power | 20% more damage below 30% health. |
| First Shell | Defense | 28% less damage while at full health. |
| True Bearing | Dexterity | +6 percentage points of accuracy, capped at 97%. |
| Rising Tempo | Speed | +6% initiative per completed turn, capped at +30%. |
| Quiet Calculation | Intellect | Feint damage +12%. |
| Unbroken Thread | Resolve | Once survives a lethal hit with 1 health, if above 20% health immediately before that hit. |
| Returning Pulse | Recovery | Heals 4% of maximum health at the start of turns 3, 6 and 9. |

## Actions

| Action | Energy cost | Effect |
|---|---|---|
| Strike | 8 | Efficient power-based damage. |
| Feint | 18 | Dexterity/intellect damage, lower armor penalty, partly ignores Guard. |
| Guard | 0 | Restores 18 energy; reduces strikes by 55% and feints by 18% until the fighter's next action. |
| Recover | 0 | Restores 26 energy; healing is round(8% max health + 0.12 × recovery), with a three-own-turn cooldown. |
| Focus | 8 | Next two attacks multiply damage by min(2.2, 1.65 + intellect/1000). Misses consume a charge. |

Every action starts by restoring 6 energy. An unaffordable action becomes Recover. Healing and energy never exceed their caps. A fighter defeated by the first action does not act afterward. The AI chooses from the previous state, before seeing the human's current choice. Higher intellect increases the probability of choosing its situational policy; it is not an unbeatable oracle.

Before focus, passives, guard and critical modifiers:

```text
Strike = (20 + 0.42 × power) × 100 / (75 + 0.65 × enemy defense)
Feint  = (16 + 0.18 × dexterity + 0.28 × intellect) × 100 / (95 + 0.4 × enemy defense)
Accuracy = clamp(base + (dexterity − enemy speed)/900 + focus bonus + passive bonus, 0.65, 0.97)
base = 0.86 for Strike; 0.91 for Feint
focus accuracy bonus = 0.03
Critical chance = 0.04 + 0.12 × dexterity / (dexterity + enemy resolve)
Critical damage = 1.35 × damage
```

Final damage is rounded to at least 1 on a hit. Speed orders actions; deterministic, identity-based tie breaking avoids a left-seat advantage. Match seed, identities, round and event name determine rolls. Identical identities draw immediately. Unfinished finite battles draw after 40 rounds; health percentages are not used to fabricate a winner.

## Special sequence (internal rules)

The observations remain specimen descriptions; the interface does not explain the hidden sequence. For its existing progress value `t`, ratings are:

```js
({
  vitality: 110 + 50*t,
  power: 90*(1 - 0.65*t),
  defense: 90 + 100*t,
  dexterity: 110 + 140*t - 190*t*t,
  speed: 100 + 80*t - 65*t*t,
  intellect: 110 + 290*t,
  resolve: 100 + 200*t,
  recovery: 90 + 70*t
})
```

Values retain three decimals. Intellect strictly increases over every finite prefix. Dexterity first rises and then falls; physical power declines; defense, resolve and recovery rise. The initial human has 800 points. Later stages intentionally leave ordinary budget parity, favoring tactical feints and focus over physical strikes. Passives progress from True Bearing/Returning Pulse, to True Bearing/Quiet Calculation, to Quiet Calculation/Unbroken Thread.

At the final circle: `absolute: true`, `stats: null`, `budget: null`, `abilities: []`. The Combat drawer is absent. A duel against anything finite is an immediate win without rolls or a fake health bar; two absolute circles draw. The invariant takes precedence over all finite passives.

## APIs, integrity and balance

Records expose `combat.ruleset = 1`. `duel()` regenerates fighters from seed/version; imports likewise regenerate stats rather than trusting supplied numbers. Low-level combat functions accept generated records or their compact catalogue form, return JSON-serializable states, and do not mutate records or previous turns.

Run `npm test` for budgets, every finite sequence step, deterministic seat symmetry, limits and endpoint handling. `node scripts/combat-audit.mjs` records 960 auto-play matches across 120 ordinary specimens. The report includes passive appearance/win counts and the human curve. These are finite samples, with stat/passive correlations; they are not a claim of competitive perfection or proof that one ability alone caused a win. Human choices and match seeds can change the result.