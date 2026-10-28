import AlienEngine from "./engine.js";
import { createHumanAlien } from "./human.js";
import { seedString } from "../src/random.js";
import { FIELDS } from "../src/registry.js";
import { observe } from "../src/observations.js";
export function generateLegacy(seed) {
  seed = seedString(seed, "v1");
  return Number(seed) === 4294967296
    ? createHumanAlien(Number(seed))
    : AlienEngine.generate(Number(seed));
}
export function legacyRecord(seed) {
  seed = seedString(seed, "v1");
  const a = generateLegacy(seed),
    g = a.genome,
    eyes = a.geometry.eyePositions;
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const p of a.geometry.allBones) {
    if (p.op === "subtract") continue;
    const b = p.bounds();
    for (const k of ["minX", "minY"]) bounds[k] = Math.min(bounds[k], b[k]);
    for (const k of ["maxX", "maxY"]) bounds[k] = Math.max(bounds[k], b[k]);
  }
  const human = Number(seed) === 4294967296;
  // 3 spheres per limb (2 joints + 1 foot)
  const limbCount = human
    ? 4
    : a.geometry.allBones.filter(
        (p) => p.moduleRole === "LimbModule" && p.type === "sphere",
      ).length / 3;
  const tailParts = a.geometry.allBones.filter(
    (p) => p.moduleRole === "TailModule",
  );
  const radii = eyes.map((e) => e.radius),
    m = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, null]));
  Object.assign(m, {
    bodyPlan: g.bodyPlan === "Winged" ? "Vertebrate" : g.bodyPlan,
    limbCount,
    legCount: human
      ? 2
      : g.bodyPlan === "Biped"
        ? null
        : g.bodyPlan === "Cephalopod" || g.bodyPlan === "Radial"
          ? 0
          : limbCount,
    wingCount: 0,
    eyeCount: eyes.length,
    eyeStyle: eyes.length ? a.eyeClusterStyle : "None",
    pupil: eyes.length ? a.eyes.pupilType : "None",
    eyeSizeVariation:
      eyes.length < 2
        ? 0
        : (Math.max(...radii) - Math.min(...radii)) / Math.max(...radii),
    tailPresent: tailParts.length > 0,
    tailType: tailParts.length ? g.tailType : "None",
    tailBodyRatio: tailParts.length ? null : 0,
    bodyAspect: (bounds.maxY - bounds.minY) / (bounds.maxX - bounds.minX),
    hornCount: 0,
    brightness: human ? 0.8 : (28 + g.skinBrightness * 34) / 100,
    hue: g.skinHue * 360,
    contrast: g.patternContrast,
    pattern:
      g.patternContrast === 0
        ? "Plain"
        : g.skinPattern < 0.25
          ? "Spots"
          : g.skinPattern < 0.5
            ? "Bands"
            : g.skinPattern < 0.75
              ? "Scales"
              : "Noise",
  });
  const record = {
    identity: { version: "v1", seed },
    schemaVersion: 2,
    measurements: m,
    materials: { ...a.materials },
    environment: null,
    behavior: null,
    ecology: null,
    geometry: { bounds },
    legacyDeclaredBodyPlan: g.bodyPlan,
    provenance: [
      {
        rule: "legacy-geometry-adapter@2",
        note: "Original geometry and seed mapping are preserved; unsupported measurements are null.",
      },
    ],
  };
  record.claims = observe(record);
  record.diagnostics = {
    validation: [],
    units: "Legacy model units. Unsupported measurements are left unknown.",
  };
  return record;
}
