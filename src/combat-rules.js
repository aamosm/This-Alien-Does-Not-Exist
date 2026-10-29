export const COMBAT_RULESET = 2;
export const MAX_ROUNDS = 60;
export const STAT_NAMES = Object.freeze({
  vitality: "Vitality",
  power: "Power",
  defense: "Defense",
  dexterity: "Dexterity",
  speed: "Speed",
  intellect: "Intellect",
  resolve: "Resolve",
  recovery: "Recovery",
});
export const STAT_HELP = {
  vitality: "Sets maximum health.",
  power: "Strength of contact attacks.",
  defense: "Reduces incoming damage.",
  dexterity: "Improves accuracy and critical chance.",
  speed: "Decides who attacks first.",
  intellect: "Strengthens feints, pulses and tactical choices.",
  resolve: "Resists critical hits and sleep.",
  recovery: "Improves healing while resting.",
};
const ability = (name, description, affinity) => ({
  name,
  description,
  affinity,
});
export const ABILITIES = Object.freeze({
  bulwark: ability("First Shell", "28% less damage at full health.", "defense"),
  surge: ability("Last Ember", "20% more damage below 30% health.", "power"),
  surefoot: ability(
    "True Bearing",
    "+6 percentage points to accuracy (maximum 97%).",
    "dexterity",
  ),
  quickening: ability(
    "Rising Tempo",
    "+3% speed each completed round, up to 24%.",
    "speed",
  ),
  insight: ability(
    "Quiet Calculation",
    "Feint and Neural pulse deal 12% more damage.",
    "intellect",
  ),
  tenacity: ability(
    "Unbroken Thread",
    "Once, survives a lethal direct hit at 1 health if above 20% before it.",
    "resolve",
  ),
  renewal: ability(
    "Returning Pulse",
    "Heals 3% maximum health every third round, through round 18.",
    "recovery",
  ),
  vigor: ability(
    "Deep Reserve",
    "+8% maximum health and 125 maximum energy instead of 100.",
    "vitality",
  ),
  antivenom: ability(
    "Clean Blood",
    "Immune to irritation from Irritant spray.",
    "recovery",
  ),
  wakeful: ability(
    "Open Watch",
    "Cannot be put to sleep. Rest is unavailable; Breathe still restores energy.",
    "resolve",
  ),
  shedskin: ability(
    "Renewing Coat",
    "Clears irritation and slowing at the end of every third round.",
    "recovery",
  ),
  barbs: ability(
    "Contact Spines",
    "Returns 8% of contact damage to the attacker. Cannot reflect itself.",
    "defense",
  ),
  siphon: ability(
    "Nutrient Return",
    "Heals 12% of direct damage dealt.",
    "vitality",
  ),
  shellguard: ability(
    "Layered Cortex",
    "Incoming hits cannot become critical hits.",
    "defense",
  ),
  torpor: ability(
    "Deep Torpor",
    "Rest and sleeping heal 35% more.",
    "recovery",
  ),
  dew: ability(
    "Moisture Draw",
    "Heals 1.5% maximum health each round in Wetland.",
    "recovery",
  ),
  sunfeed: ability(
    "Light Harvest",
    "+4 energy each round in Daylight.",
    "vitality",
  ),
  dunewalker: ability("Sand Stride", "+12% speed in Dunes.", "speed"),
  marshrunner: ability("Marsh Glide", "+12% speed in Wetland.", "speed"),
  anchored: ability("Stone Brace", "+12% defense on Scree.", "defense"),
  nightvision: ability(
    "Dark Adaptation",
    "+5 percentage points to accuracy at Night.",
    "dexterity",
  ),
  bastion: ability(
    "Folded Rampart",
    "Guard blocks 65% of ordinary damage instead of 55%.",
    "defense",
  ),
  breaker: ability(
    "Seam Finder",
    "Attacks against Guard deal 20% more damage after its reduction.",
    "intellect",
  ),
  opportunist: ability(
    "Stress Sense",
    "12% more damage against irritated or slowed targets.",
    "power",
  ),
});
const move = (name, cost, description, extra = {}) => ({
  name,
  cost,
  description,
  ...extra,
});
export const ACTIONS = Object.freeze({
  strike: move(
    "Strike",
    12,
    "Reliable contact attack. Power against defense.",
    { power: 1, accuracy: 0.92, contact: true },
  ),
  feint: move(
    "Feint",
    18,
    "A tactical hit using dexterity and intellect. Bypasses most of Guard.",
    { power: 0.9, accuracy: 0.94, mental: true, pierce: true },
  ),
  lunge: move(
    "Lunge",
    24,
    "Heavy contact attack. Stronger, but less accurate.",
    { power: 1.5, accuracy: 0.78, contact: true },
  ),
  sweep: move(
    "Sweep",
    20,
    "Lower damage. Slows the target by 20% for the next two rounds.",
    { power: 0.75, accuracy: 0.88, contact: true, status: "slow" },
  ),
  venom: move(
    "Irritant spray",
    22,
    "Low impact, then 2.5% maximum health damage for three rounds. Does not stack.",
    { power: 0.4, accuracy: 0.88, status: "poison" },
  ),
  pulse: move(
    "Neural pulse",
    22,
    "Intellect-based pressure that partially bypasses defense.",
    { power: 1.05, accuracy: 0.88, mental: true },
  ),
  drain: move(
    "Siphon",
    20,
    "Light contact attack; heals 40% of damage actually dealt.",
    { power: 0.7, accuracy: 0.9, contact: true, drain: 0.4 },
  ),
  lull: move(
    "Lulling signal",
    26,
    "No damage. Base 65% chance to induce two sleeping turns; intellect, accuracy and resolve modify it. Five-round cooldown.",
    { accuracy: 0.65, status: "sleep", cooldown: 5 },
  ),
  guard: move(
    "Guard",
    0,
    "Protects for this whole round, even if slower. Blocks 55% damage, but only 15% of a Feint. +14 energy.",
  ),
  recover: move("Breathe", 0, "Restores 34 energy. Does not heal health."),
  focus: move(
    "Focus",
    10,
    "Next two damaging attacks gain 35% damage and 3 points of accuracy. Cannot stack.",
  ),
  rest: move(
    "Rest",
    0,
    "Heals 15% health plus recovery bonus, clears irritation, then sleeps for two turns. Six-round cooldown.",
    { cooldown: 6 },
  ),
  cleanse: move(
    "Purge",
    14,
    "Clears irritation and slowing, and heals 4% maximum health.",
    { cooldown: 4 },
  ),
  sleep: move(
    "Sleep",
    0,
    "Forced while asleep: heals 3% health and restores 12 energy. One sleeping turn passes.",
    { internal: true },
  ),
});
export const TERRAINS = Object.freeze({
  plain: {
    name: "Open plain",
    description: "Neutral ground. No habitat advantage.",
    moisture: 0.5,
    cover: 0.2,
    color: "#334441",
  },
  wetland: {
    name: "Wetland",
    description:
      "Moisture-adapted creatures gain up to 8% speed and recovery; dry-adapted ones lose up to 8%.",
    moisture: 0.95,
    cover: 0.45,
    color: "#31554d",
  },
  dunes: {
    name: "Dunes",
    description:
      "Dry-adapted creatures gain up to 8% speed and recovery; moisture-adapted ones lose up to 8%.",
    moisture: 0.05,
    cover: 0.05,
    color: "#63533e",
  },
  forest: {
    name: "Dense growth",
    description:
      "High-cover creatures gain up to 8% dexterity. Low-cover creatures lose up to 8%.",
    moisture: 0.65,
    cover: 0.95,
    color: "#344c38",
  },
  scree: {
    name: "Scree",
    description:
      "Short, thick supports gain up to 8% defense. Longer, thin supports lose up to 8%.",
    moisture: 0.25,
    cover: 0.2,
    color: "#4e4d59",
  },
});
export const TIMES = Object.freeze({
  day: "Daylight",
  dusk: "Dusk / dawn",
  night: "Night",
});