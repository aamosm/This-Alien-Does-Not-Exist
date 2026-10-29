import { ACTIONS, effectiveStats, actionAvailability } from "./combat.js";

export const MAIN_MOVES = [
  "strike",
  "lunge",
  "feint",
  "guard",
  "focus",
  "recover",
];
export const EXTRA_MOVES = [
  "sweep",
  "venom",
  "pulse",
  "drain",
  "lull",
  "rest",
  "cleanse",
];
export const MOVE_KEYS = Object.fromEntries(
  [...MAIN_MOVES, ...EXTRA_MOVES].map((id, i) => [id, "123456qwertyu"[i]]),
);
export const MOVE_NOTES = {
  strike: "Steady damage",
  lunge: "Harder hit · less accurate",
  feint: "Gets through Guard",
  guard: "Block damage · gain energy",
  focus: "Boost your next two attacks",
  recover: "Restore energy",
  sweep: "Slow the opponent",
  venom: "Damage over three rounds",
  pulse: "Attack with intellect",
  drain: "Deal damage · take health",
  lull: "Try to put them to sleep",
  rest: "Heal · sleep for two turns",
  cleanse: "Clear irritation and slowing",
  sleep: "Recover while asleep",
};

export function battleAdvice(state, selected = "strike") {
  if (!state || state.finished)
    return "New opponent finds another creature. Rematch repeats this encounter.";
  const [you, foe] = state.fighters;
  const can = (id) => actionAvailability(state, 0, id).available;
  if (you.sleep)
    return `You are asleep for ${you.sleep} more turn${you.sleep === 1 ? "" : "s"}. Pass a turn to recover a little health and energy. You can still be hit.`;
  if (selected === "venom" && foe.profile.abilities.includes("antivenom"))
    return "This opponent has Clean Blood and cannot be irritated. Choose a different attack.";
  if (selected === "lull" && foe.profile.abilities.includes("wakeful"))
    return "This opponent has Open Watch and cannot be put to sleep.";
  if (you.energy < 24 && can("recover"))
    return "Low energy? Breathe restores 34. Guard restores 14 while blocking most damage.";
  if ((you.poison || you.slow) && can("cleanse"))
    return "Purge clears your irritation and slowing, and heals a little. Find it under More moves.";
  if (you.focus && ACTIONS[selected]?.power)
    return `Focus is active: your next ${you.focus} damaging attack${you.focus === 1 ? "" : "s"} get 35% more damage. A miss still uses a charge.`;
  if (selected === "focus")
    return "Focus → Lunge gives a stronger hit. Focus → Strike is more reliable. The boost lasts for two damaging attacks; it cannot stack.";
  if (selected === "guard")
    return foe.poison
      ? "The opponent is irritated. Guard reduces incoming damage while irritation keeps hurting them at round end."
      : "Irritant spray → Guard: land irritation, then defend while it deals damage. Guard also restores 14 energy.";
  if (selected === "sweep")
    return "Sweep → Lunge: slowing them can let you attack first next round. Check the speed comparison; it is not guaranteed.";
  if (selected === "venom")
    return foe.poison
      ? "They are already irritated. Another spray does not stack the effect; attack or Guard while it lasts."
      : "Irritant spray → Guard: irritation lasts three round ends and does not stack.";
  if (selected === "rest")
    return "Rest heals now, but gives up your next two turns to sleep. An opponent can still hit you. Breathe restores energy without sleeping.";
  if (selected === "recover")
    return "Breathe restores energy without healing. You give up an attack this round, so use it before you run out.";
  if (selected === "lull")
    return "Lulling signal → Rest can create time to recover if the signal lands. Sleep can fail, and they may wake before you do.";
  if (selected === "feint")
    return "Use Feint when you expect Guard. It uses intellect and dexterity, and bypasses most of Guard's protection.";
  if (selected === "drain")
    return "Siphon restores health based on the damage it actually deals. Guard and strong defense reduce both damage and healing.";
  if (selected === "cleanse")
    return "Purge removes irritation and slowing. It has a four-round cooldown, so save it for when you need it.";
  if (selected === "pulse")
    return "Neural pulse uses intellect and dexterity. It is useful against high defense, especially after Focus.";
  const stats = effectiveStats(you, state);
  if (stats.intellect > stats.power * 1.15)
    return "Your intellect is stronger than your power. Try Focus → Neural pulse; Neural pulse is under More moves.";
  if (foe.slow)
    return "The opponent is slowed. You may now act first; compare speed below. Lunge hits harder, while Strike is more reliable.";
  return "Start with Strike. Try Focus before attacking for two stronger hits, and use Breathe when energy gets low.";
}
