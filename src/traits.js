import { POOLS, TABLES, MOTIFS } from "./grammar.js";
export const DIRECT = {
  bodyPlan: { gene: "body", table: TABLES.body },
  headModule: { gene: "head", table: TABLES.head },
  limbSet: { gene: "limbSet", table: TABLES.limbSet },
  symmetry: { gene: "symmetry", table: TABLES.symmetry },
  limbShape: { gene: "limbShape", table: TABLES.limbShape },
  segmentCount: { gene: "segments", table: TABLES.segments },
  eyeCount: { gene: "eyeCount", table: TABLES.eyeCount },
  eyeStyle: { gene: "eyeStyle", table: TABLES.eyeStyle },
  pupil: { gene: "pupil", table: TABLES.pupil },
  mouth: { gene: "mouth", table: TABLES.mouth },
  pattern: { gene: "surface", table: TABLES.surface },
  diet: { gene: "diet", table: TABLES.diet },
  activity: { gene: "activity", table: TABLES.activity },
  strategy: { gene: "strategy", table: TABLES.strategy },
  motif1: { gene: "motif1", table: TABLES.motif1 },
  motifCount: { gene: "motifCount", table: TABLES.motifCount },
  ...Object.fromEntries(
    ["wings", "horns", "tentacles", "antennae", "crest", "extraLimbs"].map(
      (k) => [k, { gene: k, table: TABLES[k] }],
    ),
  ),
  tailPresent: { gene: "tail", table: TABLES.tail },
  ...Object.fromEntries(
    Object.entries({
      bodyLength: ["length", 145, 300],
      bodyWidth: ["width", 20, 62],
      headSize: ["headSize", 12, 45],
      limbLength: ["limbLength", 35, 180],
      pose: ["pose", -1, 1],
      hue: ["hue", 0, 360],
      brightness: ["lightness", 0.4, 0.8],
      saturation: ["chroma", 0.125, 0.8],
      contrast: ["contrast", 0.1, 0.65],
      ambientLight: ["light", 0, 1],
      relativeGravity: ["gravity", 0.45, 1.8],
      moisture: ["moisture", 0, 1],
      cover: ["cover", 0, 1],
      temperature: ["temperature", 0, 1],
      resources: ["resources", 0, 1],
      caution: ["caution", 0, 1],
      sociality: ["sociality", 0, 1],
    }).map(([field, [gene, min, max]]) => [field, { gene, min, max }]),
  ),
};
export const LABELS = {
  bodyPlan: "Body module",
  headModule: "Head module",
  limbSet: "Limb arrangement",
  symmetry: "Symmetry",
  limbShape: "Limb shape",
  segmentCount: "Body segments",
  limbCount: "Limbs (excluding wings)",
  legCount: "Walking legs",
  wingCount: "Wings",
  eyeCount: "Eyes",
  eyeStyle: "Eye arrangement",
  pupil: "Pupil shape",
  eyeSizeVariation: "Eye size difference",
  mouth: "Mouth",
  tailPresent: "Has a tail",
  tailType: "Tail shape",
  tailBodyRatio: "Tail / body length",
  limbBodyRatio: "Appendage / body length",
  limbThicknessRatio: "Appendage thickness / body width",
  headBodyRatio: "Head / body length",
  neckBodyRatio: "Neck / body length",
  bodyAspect: "Overall height / width",
  hornCount: "Horns",
  brightness: "OKLCH lightness",
  hue: "Colour (degrees)",
  pattern: "Skin pattern",
  contrast: "Pattern contrast",
  diet: "Diet",
  medium: "Habitat",
  activity: "Active time",
  strategy: "Feeding strategy",
  exploration: "Exploration",
  caution: "Caution",
  sociality: "Sociality",
  palette: "Colour space",
  saturation: "Chroma (normalised)",
  ambientLight: "Environmental light",
  relativeGravity: "Relative gravity",
  moisture: "Moisture",
  cover: "Cover",
  temperature: "Temperature",
  resources: "Resources",
  circularity: "Silhouette circularity",
  radialVariance: "Boundary radial variance",
  motif1: "First motif",
  motif2: "Second motif",
  motifCount: "Motif count",
  bodyLength: "Body reference length",
  bodyWidth: "Body reference width",
  headSize: "Head reference radius",
  limbLength: "Appendage reference length",
  pose: "Pose",
  wings: "Has wings",
  horns: "Has horns",
  tentacles: "Has tentacles",
  antennae: "Has antennae",
  crest: "Has a crest",
  extraLimbs: "Has extra limbs",
};
export const COUNTS = new Set([
  "segmentCount",
  "limbCount",
  "legCount",
  "wingCount",
  "eyeCount",
  "hornCount",
  "motifCount",
]);
const appearance = new Set([
  "hue",
  "brightness",
  "saturation",
  "contrast",
  "pattern",
  "bodyAspect",
  "circularity",
  "radialVariance",
  "motif1",
  "motif2",
  "motifCount",
  "palette",
]);
const ecology = new Set([
  "diet",
  "medium",
  "activity",
  "strategy",
  "exploration",
  "caution",
  "sociality",
  "ambientLight",
  "relativeGravity",
  "moisture",
  "cover",
  "temperature",
  "resources",
]);
export const FIELDS = Object.fromEntries(
  Object.keys(LABELS).map((k) => {
    const d = DIRECT[k],
      range =
        d && !d.table
          ? [d.min, d.max]
          : COUNTS.has(k)
            ? [0, k === "eyeCount" ? 11 : k === "segmentCount" ? 12 : 9]
            : k === "bodyAspect"
              ? [0, 8]
              : k === "pose"
                ? [-1, 1]
                : [0, 1];
    const type = d?.table
      ? typeof d.table[0][1] === "boolean"
        ? "boolean"
        : typeof d.table[0][1] === "number"
          ? "number"
          : "category"
      : ["medium", "tailType", "motif2", "palette"].includes(k)
        ? "category"
        : k === "hue"
          ? "hue"
          : "number";
    return [
      k,
      {
        type,
        range,
        group: ecology.has(k)
          ? "ecology"
          : appearance.has(k)
            ? "appearance"
            : "anatomy",
        inverse:
          d && !["extraLimbs", "pupil", "eyeStyle", "contrast"].includes(k)
            ? "direct"
            : "derived",
      },
    ];
  }),
);
export const OPTIONS = Object.fromEntries(
  Object.entries(DIRECT)
    .filter(([, d]) => d.table)
    .map(([k, d]) => [k, d.table.map(([, v]) => v)]),
);
Object.assign(OPTIONS, {
  eyeStyle: ["None", "Central", ...POOLS.eyeStyle],
  pupil: ["None", ...POOLS.pupil],
  medium: ["Land", "Water", "Air"],
  tailType: ["None", "Curved"],
  motif2: ["None", ...MOTIFS],
  palette: ["OKLCH"],
});
FIELDS.contrast.range = [0, 0.65];
export const UNITS = Object.fromEntries(
  Object.entries(FIELDS).map(([k, f]) => [
    k,
    COUNTS.has(k)
      ? "Whole number"
      : k === "hue"
        ? "0° red · 120° green · 240° blue"
        : k.endsWith("Ratio") || k === "bodyAspect"
          ? "Ratio: 0.5 means half; 1 means equal"
          : k === "relativeGravity"
            ? "0.45–1.8 × reference gravity"
            : ["bodyLength", "bodyWidth", "headSize", "limbLength"].includes(k)
              ? "Developmental model units"
              : ["number", "hue"].includes(f.type)
                ? `${f.range[0]}–${f.range[1]} scale`
                : "",
  ]),
);
