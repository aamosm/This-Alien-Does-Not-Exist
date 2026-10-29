# Combat rules and player reference

This is a local fictional ecological game model with no elemental types. Open duel.html from the generator's Duel button or press D. Your creature comes with you and receives a random ordinary opponent. New opponent (N) keeps your creature, avoids recent opponent identities and draws a fresh encounter code. It prefers a different outline from yours; it does not use a fixed roster or guarantee equal win chances. Shared links retain their explicit creatures and moves. Specific seeds remain available in the collapsed settings.

Six main moves stay visible; More moves contains the other seven. Select with the displayed key or click, then use Enter to start or play one round. The computer chooses independently, before seeing your chosen move. Auto (A) plays at a visible pace, and Esc pauses after the current action sequence. Shortcuts ignore typing, held-key repeats and browser modifier keys. Generator shortcuts are N for discovery and D for Duel.

Hints explain ordinary move sequences such as Focus → Strike, Irritant spray → Guard and Sweep → Lunge, and respond to energy, sleep, focus and known immunities. They do not change the combat rules or guarantee success. The arena shows who is faster and your current habitat/activity modifiers; full stats and automatic passive abilities remain expandable. Rematch keeps the setup and rolls. Changing terrain or time starts a fresh preview, while New opponent also changes the code.

## Two different kinds of seed

Creature seeds determine anatomy and base ratings. The encounter code controls chance and optional automatic terrain/time selection. It does not increase a creature's strength. Codes are trimmed non-empty text of at most 64 characters. Same fighters, code, resolved environment, ruleset and moves reproduce the same result. Different moves can produce a different winner. Replay links save both choices for every played round.

## Ratings

Ordinary creatures share 800 points: 40 per rating plus 480 distributed by positive anatomical weights with largest-remainder rounding. Body mass, reach, support thickness, limb/eye counts, head proportions, exploration, caution, resources and moisture create trade-offs. Exact weights are in combat-profile.js. Maximum health is round((300 + 2 × vitality) × Deep Reserve multiplier); ordinary maximum energy is 100, or 125 with Deep Reserve. These are simulation rules, not biological measurements.

| Rating | Effect |
| --- | --- |
| Vitality | Sets maximum health. |
| Power | Strength of contact attacks. |
| Defense | Reduces incoming damage. |
| Dexterity | Improves accuracy and critical chance. |
| Speed | Decides who attacks first. |
| Intellect | Strengthens feints, pulses and tactical choices. |
| Resolve | Resists critical hits and sleep. |
| Recovery | Improves healing while resting. |

## Actions

All finite creatures can use these functional moves; names describe the simulated effect, not proof of an anatomical gland or psychic organ. Sleep is automatic only while asleep; the other 13 are selectable.

| Move | Energy | Effect |
| --- | --- | --- |
| Strike | 12 | Reliable contact attack. Power against defense. |
| Feint | 18 | A tactical hit using dexterity and intellect. Bypasses most of Guard. |
| Lunge | 24 | Heavy contact attack. Stronger, but less accurate. |
| Sweep | 20 | Lower damage. Slows the target by 20% for the next two rounds. |
| Irritant spray | 22 | Low impact, then 2.5% maximum health damage for three rounds. Does not stack. |
| Neural pulse | 22 | Intellect-based pressure that partially bypasses defense. |
| Siphon | 20 | Light contact attack; heals 40% of damage actually dealt. |
| Lulling signal | 26 | No damage. Base 65% chance to induce two sleeping turns; intellect, accuracy and resolve modify it. Five-round cooldown. |
| Guard | 0 | Protects for this whole round, even if slower. Blocks 55% damage, but only 15% of a Feint. +14 energy. |
| Breathe | 0 | Restores 34 energy. Does not heal health. |
| Focus | 10 | Next two damaging attacks gain 35% damage and 3 points of accuracy. Cannot stack. |
| Rest | 0 | Heals 15% health plus recovery bonus, clears irritation, then sleeps for two turns. Six-round cooldown. |
| Purge | 14 | Clears irritation and slowing, and heals 4% maximum health. |
| Sleep | 0 | Forced while asleep: heals 3% health and restores 12 energy. One sleeping turn passes. |

Every surviving creature regains five energy at round end. Invalid actions fail; they are never silently replaced. The only committed action that can be superseded is one interrupted by induced sleep. Rest sets two sleeping turns; each subsequent Sleep action consumes one. Lulling a slower opponent may consume its first sleeping turn in the current round. Sleep does not grant invulnerability. Purge has a four-round cooldown. Cooldowns count complete rounds after use. Card explanations show when moves become available.

Guard is declared at the start of the round, so it works even against a faster attacker. A defeated fighter cannot take its later action. Status upkeep is resolved for both sides before determining a possible simultaneous draw. Focus has two charges, consumed by damaging attacks including misses; it does not stack. Irritation does not stack; reapplication refreshes three round-end ticks. Slowing lasts two future rounds.

## Environment, activity and sleep

Time is Daylight, Dusk/dawn or Night and remains fixed during a battle. Diurnal creatures prefer daylight, nocturnal ones night, and crepuscular ones dusk/dawn. Matching gives +6% speed and +3% dexterity; otherwise these are −6% and −3%. A creature always begins awake: rest preference and actual Sleep status are separate. The comparison shows its usual rest window and the active modifiers.

| Terrain | Effect |
| --- | --- |
| Open plain | Neutral ground. No habitat advantage. |
| Wetland | Moisture-adapted creatures gain up to 8% speed and recovery; dry-adapted ones lose up to 8%. |
| Dunes | Dry-adapted creatures gain up to 8% speed and recovery; moisture-adapted ones lose up to 8%. |
| Dense growth | High-cover creatures gain up to 8% dexterity. Low-cover creatures lose up to 8%. |
| Scree | Short, thick supports gain up to 8% defense. Longer, thin supports lose up to 8%. |

Moisture and cover preferences come from the generated environment. Support fit uses limb thickness relative to reach. These are bounded game adaptations. Abilities may add further advantages. Wetland/Dunes alter effective recovery as well as speed; Rest uses effective recovery. The entire setup is part of battle identity.

## Passive abilities

Each finite creature gets two distinct passives. Stat affinities weight their seed-determined selection; moisture and activity also bias habitat-related passives. No passive is a label without an implemented effect. All 24 are reachable in the ordinary pool. The special human sequence retains its deliberate ability progression.

| Passive | Affinity | Effect |
| --- | --- | --- |
| First Shell | Defense | 28% less damage at full health. |
| Last Ember | Power | 20% more damage below 30% health. |
| True Bearing | Dexterity | +6 percentage points to accuracy (maximum 97%). |
| Rising Tempo | Speed | +3% speed each completed round, up to 24%. |
| Quiet Calculation | Intellect | Feint and Neural pulse deal 12% more damage. |
| Unbroken Thread | Resolve | Once, survives a lethal direct hit at 1 health if above 20% before it. |
| Returning Pulse | Recovery | Heals 3% maximum health every third round, through round 18. |
| Deep Reserve | Vitality | +8% maximum health and 125 maximum energy instead of 100. |
| Clean Blood | Recovery | Immune to irritation from Irritant spray. |
| Open Watch | Resolve | Cannot be put to sleep. Rest is unavailable; Breathe still restores energy. |
| Renewing Coat | Recovery | Clears irritation and slowing at the end of every third round. |
| Contact Spines | Defense | Returns 8% of contact damage to the attacker. Cannot reflect itself. |
| Nutrient Return | Vitality | Heals 12% of direct damage dealt. |
| Layered Cortex | Defense | Incoming hits cannot become critical hits. |
| Deep Torpor | Recovery | Rest and sleeping heal 35% more. |
| Moisture Draw | Recovery | Heals 1.5% maximum health each round in Wetland. |
| Light Harvest | Vitality | +4 energy each round in Daylight. |
| Sand Stride | Speed | +12% speed in Dunes. |
| Marsh Glide | Speed | +12% speed in Wetland. |
| Stone Brace | Defense | +12% defense on Scree. |
| Dark Adaptation | Dexterity | +5 percentage points to accuracy at Night. |
| Folded Rampart | Defense | Guard blocks 65% of ordinary damage instead of 55%. |
| Seam Finder | Intellect | Attacks against Guard deal 20% more damage after its reduction. |
| Stress Sense | Power | 12% more damage against irritated or slowed targets. |

## Damage and pacing

Before passives, focus, guard and critical modifiers:

```text
Contact rating = power
Mental rating = 0.6 × intellect + 0.4 × dexterity
Damage = (46 + 0.38 × rating) × move.power × 100 / (85 + armor × target defense)
armor = 0.32 for mental moves, otherwise 0.60
Accuracy = clamp(move.accuracy + (dexterity − target speed)/1600 + focus bonus + passives, 0.55, 0.97)
Lulling signal base = clamp(0.65 + (intellect − target resolve)/1800, 0.30, 0.75)
Lulling signal then uses the same final accuracy clamp and passive accuracy bonuses.
Focus bonus = 0.03 accuracy and ×1.35 damage, for damaging moves only
Critical chance = 0.03 + 0.10 × dexterity / (dexterity + target resolve)
Critical multiplier = 1.25
```

Speed controls attack order; deterministic identity-based tie breaking avoids a fixed left-seat advantage. Damage is rounded and capped at remaining health. Passive healing uses damage actually dealt, not overkill. Reflection does not recurse. Recovery halves after round 30 and stops after round 45 to prevent indefinite healing loops. Sixty rounds without a knockout is a draw. Ordinary pacing is measured by combat-audit.mjs; human decisions can differ from that sample.

## Special progression

The existing human progression formulas remain unchanged: intellect strictly rises at every finite prefix, physical power falls, dexterity first rises then falls, while defense/resolve/recovery rise. Later stages intentionally exceed ordinary parity. The final circle has null stats, null health and energy, and no passives. It immediately defeats finite creatures; two circles draw. Identical finite identities also draw immediately. Hidden-sequence explanations stay out of the player UI.

## Motion and rendering

The arena caches a Quick-render texture and deforms it through a continuous triangular mesh using existing limb/neck anchors. Shared vertices have a single destination, so body surfaces, attachments, eyes and markings travel together. Each action has its own bounded motion: a winding lunge, double feint, low sweep, guarded crouch, breath, sleep or recovery motion. Attacks vary deterministically by creature; misses produce a dodge and hits produce recoil. The mesh deformation fades in and returns to rest at each action boundary. This is a gentle two-dimensional animation, not physics or a new skeletal simulator. The human's motion fades as its outline loses limbs. The final circle stays still. Legacy records lack the new rig, so they retain their renderer and use whole-body motion only. Reduced-motion preference disables action animation, without changing results. There are no perpetual idle animations.

## Verification and APIs

Run npm test, npm run test:browser and node scripts/combat-audit.mjs. Tests cover guard timing, sleep, cooldowns, every passive's observable effect, replay identity, opponent selection, keyboard interaction, status-aware hints, bounded animation poses, mesh continuity, pacing and old seed compatibility. The 960-match report is a finite automated sample, not a claim of perfect competitive balance. Combat ruleset 2 versions these mechanics independently of generator identity. See API.md for interactive functions and static-host limitations.