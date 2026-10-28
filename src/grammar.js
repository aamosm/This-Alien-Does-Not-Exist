import {
  bodyScaffold,
  hullPoints,
  headDimensions,
  headHull,
  baseLimbCount,
} from "./anatomy.js";
import { decode, unit, tableChoice, choiceInterval} from "./grammar-genome.js";
import { silhouette, repairSilhouette } from "./silhouette.js";
import { oklchRGB } from "./colour.js";
export const POOLS = {
  body: [
    "Spindle",
    "Pear",
    "Keel",
    "Crescent",
    "Saddle",
    "Chevron",
    "Bean",
    "Tapered",
    "Waisted",
    "Arched",
    "Folded",
    "Undulating",
  ],
  head: [
    "Wedge",
    "Brow",
    "Muzzle",
    "Shield",
    "Narrow",
    "Pendant",
    "Broad",
    "Tilted",
    "Hammer",
    "Scoop",
    "Long",
    "Offset",
  ],
  limbSet: [
    "Low sweep",
    "High sweep",
    "Staggered",
    "Trailing",
    "Forward reach",
    "Crouched",
    "Splayed",
    "Tucked",
    "Offset",
    "Raised",
    "Long stride",
    "Folded",
  ],
  surface: [
    "Plain",
    "Spots",
    "Bands",
    "Reticulate",
    "Speckles",
    "Mottled",
    "Veins",
    "Dashes",
    "Scales",
    "Rings",
    "Striae",
    "Islands",
  ],
  eyeStyle: [
    "Arc",
    "Crown",
    "Diagonal",
    "Staggered",
    "Bilateral",
    "Uneven",
    "Low arc",
    "High arc",
    "Spiral",
    "Cluster",
    "Offset pair",
    "Split row",
  ],
  mouth: [
    "Jaw",
    "Filter",
    "Beak",
    "Mandibles",
    "Proboscis",
    "Pucker",
    "Slit",
    "Rosette",
    "Cleft",
    "Tube",
    "Gills",
    "Plate",
  ],
  pupil: [
    "round",
    "slit",
    "horizontal",
    "star",
    "diamond",
    "oval",
    "crescent",
    "double",
    "triangle",
    "square",
    "ring",
    "pinpoint",
  ],
  symmetry: ["Bilateral", "Partial", "None", "Radial"],
  limbShape: ["Curved", "Segmented", "Tapering", "Flattened"],
  diet: ["Carnivore", "Herbivore", "Omnivore", "Filter feeder", "Detritivore"],
  activity: ["Diurnal", "Nocturnal", "Crepuscular"],
  strategy: ["Ambush", "Roaming", "Grazing", "Suspension feeding"],
};
export const MOTIFS = Array.from(
  { length: 96 },
  (_, i) =>
    `${["Dorsal", "Left flank", "Right flank", "Shoulder", "Forehead", "Spinal", "Hip", "Neck", "Cheek", "Lower flank", "Upper flank", "Rump"][Math.floor(i / 8)]} ${["ridge", "rosette", "dimple field", "raised seam", "lobe", "hatching", "plate", "marbling"][i % 8]}`,
);
function cappedZipf() {
  let lo = 0,
    hi = 100;
  for (let j = 0; j < 80; j++) {
    let mid = (lo + hi) / 2,
      total = MOTIFS.reduce(
        (s, _, i) => s + Math.min(0.017, mid / (i + 1) ** 1.35),
        0,
      );
    if (total > 1) hi = mid;
    else lo = mid;
  }
  return MOTIFS.map((m, i) => [
    Math.min(0.017, (lo + hi) / 2 / (i + 1) ** 1.35),
    m,
  ]);
}
export const MOTIF_TABLE = cappedZipf();
export const TABLES = Object.fromEntries(
  Object.entries(POOLS).map(([k, values]) => [k, values.map((v) => [1, v])]),
);
Object.assign(TABLES, {
  symmetry: [
    [0.362, "Bilateral"],
    [0.362, "Partial"],
    [0.27, "None"],
    [0.006, "Radial"],
  ],
  eyeCount: Array.from({ length: 12 }, (_, i) => [1, i]),
  segments: Array.from({ length: 12 }, (_, i) => [1, i + 1]),
  wings: [
    [0.994, false],
    [0.006, true],
  ],
  ...Object.fromEntries(
    ["horns", "tail", "tentacles", "antennae", "crest", "extraLimbs"].map(
      (k) => [
        k,
        [
          [["tentacles", "extraLimbs"].includes(k) ? 0.994 : 0.99, false],
          [["tentacles", "extraLimbs"].includes(k) ? 0.006 : 0.01, true],
        ],
      ],
    ),
  ),
  motif1: MOTIF_TABLE,
  motif2: MOTIF_TABLE,
  motifCount: [
    [1, 1],
    [1, 2],
  ],
});
const TAU = Math.PI * 2,
  lerp = (a, b, t) => a + (b - a) * t;
export function parameters(seed) {
  const genome = decode(seed),
    u = (k) => unit(genome, k),
    choose = (k) => tableChoice(genome.digits[k], TABLES[k]);
  const p = {};
  for (const key of Object.keys(TABLES)) p[key] = choose(key);
  for (const key of ["body", "head", "limbSet"]) {
    const [lo, hi] = choiceInterval(p[key], TABLES[key]);
    p[key + "Profile"] = (genome.digits[key] - lo) / Math.max(1, hi - lo);
  }
  Object.assign(p, {
    length: lerp(145, 300, u("length")),
    width: lerp(20, 62, u("width")),
    taper: lerp(0.2, 0.85, u("taper")),
    lobes: lerp(0.02, 0.33, u("lobes")),
    bend: lerp(-0.8, 0.8, u("bend")),
    headSize: lerp(12, 45, u("headSize")),
    headWidth: lerp(0.55, 1.55, u("headWidth")),
    neck: lerp(6, 58, u("neck")),
    limbLength: lerp(35, 180, u("limbLength")),
    limbWidth: lerp(2.5, 10, u("limbWidth")),
    pose: lerp(-1, 1, u("pose")),
    phase: u("phase") * TAU,
    asymmetry: lerp(0.03, 0.38, u("asymmetry")),
    tailLength: lerp(30, 150, u("tailLength")),
    eyeSize: lerp(0.06, 0.13, u("eyeSize")),
    eyeVariance: u("eyeVariance") * 0.32,
    iris: lerp(0.38, 0.8, u("iris")),
    lid: u("lid") * 0.35,
    hue: u("hue") * 360,
    chroma: lerp(0.025, 0.16, u("chroma")),
    lightness: lerp(0.4, 0.8, u("lightness")),
    contrast: lerp(0.1, 0.65, u("contrast")),
    patternScale: lerp(7, 26, u("patternScale")),
    gravity: lerp(0.45, 1.8, u("gravity")),
    light: u("light"),
    moisture: u("moisture"),
    cover: u("cover"),
    temperature: u("temperature"),
    resources: u("resources"),
    exploration: u("exploration"),
    caution: u("caution"),
    sociality: u("sociality"),
    frame: lerp(0.66, 0.87, u("frame")),
    offsetX: lerp(-0.045, 0.045, u("offsetX")),
    offsetY: lerp(-0.045, 0.045, u("offsetY")),
    detail: u("detail"),
    iconCount: 1 + Math.floor(u("iconCount") * 2.999),
  });
  if (p.motif2 === p.motif1)
    p.motif2 = MOTIFS[(MOTIFS.indexOf(p.motif2) + 31) % MOTIFS.length];
  // monotone deformation on [0,1] so exploration has an analytic inverse
  const e = p.exploration,
    shift = 0.12 * (0.5 - p.resources);
  p.exploration = e + shift * e * (1 - e);
  return { genome, p };
}
export function geometryOf(p) {
  const parts = [],
    limbs = [],
    eyes = [];
  let ordinal = 0;
  const ellipse = (
    role,
    x,
    y,
    rx,
    ry,
    z = 0,
    rotation = 0,
    material = "skin",
  ) => {
    const a = {
      id: `${role}-${ordinal++}`,
      role,
      shape: "ellipse",
      x,
      y,
      rx,
      ry,
      z,
      rotation,
      material,
    };
    parts.push(a);
    return a;
  };
  const ribbon = (role, points, radii, z = 0, material = "skin") => {
    const a = {
      id: `${role}-${ordinal++}`,
      role,
      shape: "ribbon",
      points,
      radii,
      z,
      material,
    };
    parts.push(a);
    return a;
  };
  const polygon = (role, points, z = 0, material = "skin") => {
    const a = {
      id: `${role}-${ordinal++}`,
      role,
      shape: "polygon",
      points,
      z,
      material,
    };
    parts.push(a);
    return a;
  };
  const hi = POOLS.head.indexOf(p.head),
    li = POOLS.limbSet.indexOf(p.limbSet),
    n = 14;
  const { spine, radii, form, depth } = bodyScaffold(p);
  if (form === "hull") {
    const body = polygon("body", hullPoints(spine, radii), 0);
    body.depth = depth;
  } else {
    const body = ribbon("body", spine, radii, 0);
    body.depthScale = form === "jointed" ? 0.7 : 1;
  }
  for (let i = 1; i < p.segments; i++) {
    const j = Math.round((i / p.segments) * (n - 1)),
      q = spine[j];
    const seam = ribbon(
      "surface-segment",
      [
        { x: q.x - radii[j] * 0.7, y: q.y },
        { x: q.x, y: q.y - radii[j] * 0.08 },
        { x: q.x + radii[j] * 0.7, y: q.y },
      ],
      [0.65, 0.9, 0.65],
      0,
    );
    seam.relief = 0.4;
  }
  const top = spine[1],
    head = {
      x: top.x + Math.sin(p.phase) * p.asymmetry * p.width,
      y: spine[0].y - p.neck * 0.6 - p.headSize * 0.35,
      ...headDimensions(p),
      rotation: p.pose * 0.22 + (hi - 5.5) * 0.035,
    };
  ribbon(
    "neck",
    [top, { x: head.x, y: head.y }],
    [p.width * 0.3, p.headSize * 0.35],
    1,
  );
  const faceHull = headHull(head, p.head);
  if (faceHull) {
    const face = polygon("head", faceHull, 2);
    face.depth = Math.min(head.rx, head.ry) * 0.85;
  } else ellipse("head", head.x, head.y, head.rx, head.ry, 2, head.rotation);
  let limbCount =
    p.symmetry === "Radial"
      ? 3 + Math.floor(p.detail * 6.999)
      : p.tentacles
        ? 6 + Math.floor(p.detail * 2.999)
        : p.extraLimbs
          ? 6 + 2 * Math.floor(p.detail * 1.999)
          : baseLimbCount(p.limbSet);
  for (let i = 0; i < limbCount; i++) {
    const side = i % 2 ? -1 : 1,
      t = ((i + 0.7) / (limbCount + 1.3)) ** (0.55 + p.limbSetProfile * 1.2),
      j = Math.round((0.2 + 0.65 * t) * (n - 1));
    const radial = p.symmetry === "Radial",
      root = radial
        ? {
            x:
              spine[7].x +
              Math.cos(p.phase + (i * TAU) / limbCount) * p.width * 0.5,
            y:
              spine[7].y +
              Math.sin(p.phase + (i * TAU) / limbCount) * p.width * 0.7,
          }
        : { x: spine[j].x + side * radii[j] * 0.55, y: spine[j].y };
    let angle = radial
      ? p.phase + (i * TAU) / limbCount + 0.22 * Math.sin(i * 2.399 + p.phase)
      : (side > 0 ? 0 : Math.PI) + (0.25 + (li % 3) * 0.22) + p.pose * 0.45;
    angle +=
      (p.limbSetProfile - 0.5) * 1.5 +
      (0.12 + 0.3 * p.asymmetry) * Math.sin(i * 1.71 + p.phase);
    const symmetry =
      p.symmetry === "Bilateral"
        ? 0.03
        : p.symmetry === "Partial"
          ? 0.14
          : p.asymmetry;
    const length = p.limbLength * (1 + symmetry * Math.sin(i * 2.4 + p.phase));
    const points = [root];
    let cursor = root,
      seg = p.tentacles ? 8 : 4;
    for (let j = 1; j <= seg; j++) {
      const curve = p.tentacles
        ? 0.65 * Math.sin(j * 0.7 + i)
        : p.limbShape === "Segmented"
          ? j % 2
            ? 0.32
            : -0.24
          : (0.15 + 0.7 * p.limbSetProfile) *
              Math.sin(j * (0.55 + p.taper) + p.phase) +
            p.bend * 0.35;
      const a = angle + curve + side * j * 0.07;
      cursor = {
        x: cursor.x + (Math.cos(a) * length) / seg,
        y: cursor.y + (Math.sin(a) * length) / seg,
      };
      points.push(cursor);
    }
    const rr = points.map((_, j) => {
      const t = j / seg;
      const profile =
        p.limbShape === "Tapering"
          ? 1 - 0.92 * t ** (0.55 + p.taper)
          : p.limbShape === "Flattened"
            ? (1 - 0.65 * t) * (1 + 0.75 * Math.sin(Math.PI * t))
            : p.limbShape === "Segmented"
              ? (1 - t * p.taper * 0.8) * (j % 2 ? 0.72 : 1.15)
              : 1 - (j / (seg + 1)) * p.taper;
      return p.limbWidth * profile;
    });
    const limbPart = ribbon(
      p.tentacles ? "tentacle" : "leg",
      points,
      rr,
      side > 0 ? 1 : -1,
    );
    limbPart.depthScale = p.limbShape === "Flattened" ? 0.38 : 1;
    limbs.push({
      id: `limb-${i}`,
      role: p.tentacles ? "tentacle" : "leg",
      points,
      radii: rr,
      length,
      root,
      z: side > 0 ? 1 : -1,
      jointAngles: [angle],
    });
    if (p.extraLimbs && i % 2 === 0) {
      const a = points[2],
        b = { x: a.x + side * length * 0.35, y: a.y - length * 0.32 };
      ribbon("branch", [a, b], [rr[2], rr.at(-1)], 0);
    }
  }
  let tail = null;
  if (p.tail) {
    const root = spine.at(-1),
      points = Array.from({ length: 9 }, (_, i) => ({
        x:
          root.x +
          (Math.sin(i * 0.4 + p.phase) - Math.sin(p.phase)) *
            p.tailLength *
            0.27,
        y: root.y + (i * p.tailLength) / 8,
      }));
    tail = { type: "Curved", length: p.tailLength, points };
    ribbon(
      "tail",
      points,
      points.map((_, i) => p.width * 0.18 * (1 - i / 10)),
      -2,
    );
  }
  if (p.wings)
    for (const side of [-1, 1]) {
      const root = spine[5];
      // Membrane sweep, chord, tip and scalloping vary continuously with anatomy.
      // The former fixed quadrilateral made all winged silhouettes look alike.
      const span =
        p.limbLength * (1.2 + p.taper) * (1 + side * p.asymmetry * 0.25);
      const chord = span * (0.16 + p.taper * 0.65);
      const sweep = span * (p.bend * 0.75 - 0.15);
      const local = [
        [0, 0],
        [span * 0.28, sweep * 0.2 - chord * 0.6],
        [span * 0.64, sweep * 0.58 - chord * (0.45 + p.taper * 0.55)],
        [span, sweep],
        [span * 0.77, sweep * 0.77 + chord * 0.3],
        [span * 0.61, sweep * 0.61 + chord * (0.5 + p.asymmetry)],
        [span * 0.36, sweep * 0.36 + chord * 0.55],
        [span * 0.13, chord * 0.3],
      ];
      const points = local.map(([x, y]) => ({
        x: root.x + side * x,
        y: root.y + y,
      }));
      polygon("wing-membrane", points, -1, "membrane");
      ribbon(
        "wing-edge",
        points.slice(0, 4),
        [p.limbWidth * 0.8, 2.6, 1.8, 0.6],
        0,
      );
    }
  if (p.horns)
    for (let i = 0; i < p.iconCount; i++) {
      const x = head.x + (i - (p.iconCount - 1) / 2) * head.rx * 0.6;
      polygon(
        "horn",
        [
          { x: x - 3, y: head.y - head.ry * 0.5 },
          { x: x + 3, y: head.y - head.ry * 0.5 },
          {
            x: x + (i % 2 ? 1 : -1) * head.rx * 0.4,
            y: head.y - head.ry * (1.4 + p.detail),
          },
        ],
        3,
        "horn",
      );
    }
  if (p.antennae)
    for (const side of [-1, 1]) {
      const a = {
        x: head.x + side * head.rx * 0.55,
        y: head.y - head.ry * 0.6,
      };
      ribbon(
        "antenna",
        [
          a,
          { x: a.x + side * p.headSize * 0.5, y: a.y - p.headSize * 0.8 },
          { x: a.x + side * p.headSize * 0.8, y: a.y - p.headSize },
        ],
        [2, 1.4, 0.8],
        3,
        "accent",
      );
    }
  if (p.crest) {
    const a = spine[5];
    polygon(
      "crest",
      [
        a,
        { x: a.x + p.width * 1.2, y: a.y - p.length * 0.12 },
        { x: a.x + p.width * 0.9, y: a.y + p.length * 0.08 },
        { x: spine[8].x, y: spine[8].y },
      ],
      1,
      "accent",
    );
  }
  const motifs = p.motifCount === 1 ? [p.motif1] : [p.motif1, p.motif2];
  for (const motif of motifs) {
    const index = MOTIFS.indexOf(motif),
      zone = Math.floor(index / 8),
      type = index % 8,
      zonePoint = (j, side = 0) => ({
        x: spine[j].x + side * radii[j],
        y: spine[j].y,
      }),
      facePoint = (u, v) => ({
        x:
          head.x +
          u * head.rx * Math.cos(head.rotation) -
          v * head.ry * Math.sin(head.rotation),
        y:
          head.y +
          u * head.rx * Math.sin(head.rotation) +
          v * head.ry * Math.cos(head.rotation),
      }),
      positions = [
        zonePoint(5),
        zonePoint(7, -0.6),
        zonePoint(7, 0.6),
        zonePoint(2, 0.45),
        facePoint(0, -0.35),
        zonePoint(6),
        zonePoint(10, -0.45),
        { x: (top.x + head.x) / 2, y: (top.y + head.y) / 2 },
        facePoint(0.55, 0.2),
        zonePoint(10, 0.55),
        zonePoint(3, -0.55),
        zonePoint(12),
      ],
      { x, y } = positions[zone],
      size =
        (zone === 4 || zone === 8
          ? p.headSize * 0.7
          : zone === 7
            ? Math.min(p.width, p.headSize) * 0.7
            : p.width) *
        (0.12 + p.detail * 0.12),
      firstPart = parts.length;
    if (type === 4 || type === 6)
      ellipse(
        "motif",
        x,
        y,
        size * (type === 6 ? 1.4 : 1),
        size * 0.65,
        2,
        p.phase,
        "accent",
      );
    else
      for (let q = 0; q < (type === 1 ? 7 : type === 2 ? 5 : 3); q++) {
        const a = type === 1 ? (q * TAU) / 7 : p.phase * 0.3;
        const px =
            x + (type === 1 ? Math.cos(a) * size : (q - 1) * size * 0.55),
          py =
            y +
            (type === 1
              ? Math.sin(a) * size
              : Math.sin(q + type) * size * 0.35);
        if (type === 2)
          ellipse(
            "motif",
            px,
            py,
            size * 0.17,
            size * 0.15,
            2,
            p.phase,
            "accent",
          );
        else
          ribbon(
            "motif",
            type === 5
              ? [
                  { x: px - size * 0.2, y: py - size * 0.5 },
                  { x: px + size * 0.2, y: py + size * 0.5 },
                ]
              : [
                  { x: px - size * 0.6, y: py },
                  {
                    x: px,
                    y:
                      py - size * (type === 7 ? 0.65 : type === 3 ? 0.05 : 0.3),
                  },
                  {
                    x: px + size * 0.7,
                    y: py + size * (type === 7 ? -0.3 : 0.2),
                  },
                ],
            type === 5
              ? [size * 0.12, size * 0.08]
              : [size * 0.12, size * 0.16, size * 0.08],
            2,
            "accent",
          );
      }
    for (const part of parts.slice(firstPart)) {
      part.motif = motif;
      part.relief = type === 2 ? -1 : 1;
    }
  }
  const count = p.eyeCount,
    style = POOLS.eyeStyle.indexOf(p.eyeStyle);
  for (let i = 0; i < count; i++) {
    const a = (i + 0.5) * 2.399963229728653 + p.phase * 0.15,
      along = count < 2 ? 0.5 : i / (count - 1);
    let u, v;
    if (count === 1) [u, v] = [0, -0.13];
    else if (style === 0) {
      const angle = Math.PI * (1.15 + along * 0.7);
      u = Math.cos(angle) * 0.62;
      v = Math.sin(angle) * 0.38;
    } else if (style === 1) {
      const angle = Math.PI * (1 + (i + 0.5) / count);
      u = Math.cos(angle) * 0.68;
      v = Math.sin(angle) * 0.58 - 0.04;
    } else if (style === 2) {
      u = (along - 0.5) * 1.05;
      v = u * 0.72 - 0.12;
    } else if (style === 3) {
      const cols = Math.ceil(Math.sqrt(count)),
        rows = Math.ceil(count / cols);
      u =
        (((i % cols) - (cols - 1) / 2) * 0.95) / cols +
        (Math.floor(i / cols) % 2 ? 0.08 : -0.08);
      v = ((Math.floor(i / cols) - (rows - 1) / 2) * 0.8) / rows - 0.12;
    } else if (style === 4 || style === 10) {
      const row = Math.floor(i / 2),
        rows = Math.ceil(count / 2);
      u = (i % 2 ? 1 : -1) * (style === 10 ? 0.25 + row * 0.045 : 0.34);
      v =
        ((row - (rows - 1) / 2) * 0.9) / rows -
        0.12 +
        (style === 10 ? (i % 2 ? 0.1 : -0.1) : 0);
    } else if (style === 6 || style === 7) {
      u = (along - 0.5) * 1.12;
      v = (style === 6 ? 0.18 : -0.42) + (style === 6 ? -1 : 1) * u * u * 0.55;
    } else if (style === 8) {
      const radius = 0.08 + along * 0.53,
        angle = along * TAU * 1.55 + p.phase * 0.1;
      u = Math.cos(angle) * radius;
      v = Math.sin(angle) * radius * 0.8 - 0.12;
    } else if (style === 11) {
      const cols = Math.ceil(count / 2),
        row = Math.floor(i / cols),
        rowCount = row ? count - cols : cols;
      u = (((i % cols) - (rowCount - 1) / 2) * 1.0) / Math.max(1, rowCount - 1);
      v = row ? 0.16 : -0.36;
    } else {
      const rad =
        style === 5
          ? 0.18 + 0.42 * ((i * 0.618 + p.detail) % 1)
          : 0.12 + 0.48 * Math.sqrt((i + 0.5) / count);
      u = Math.cos(a) * rad;
      v = Math.sin(a) * rad * 0.75 - 0.13;
    }
    const sizeFactor = 1 - p.eyeVariance * (0.5 + 0.5 * Math.sin(i * 2.71));
    const radius =
        (p.headSize * p.eyeSize * sizeFactor) / Math.sqrt(1 + count * 0.09),
      socketRadius = radius * 1.23;
    eyes.push({
      id: `eye-${i}`,
      transform: {
        x:
          head.x +
          u * head.rx * Math.cos(head.rotation) -
          v * head.ry * Math.sin(head.rotation),
        y:
          head.y +
          u * head.rx * Math.sin(head.rotation) +
          v * head.ry * Math.cos(head.rotation),
        rotation: head.rotation,
      },
      radius,
      socketRadius,
      pupil: p.pupil,
      irisRatio: p.iris,
      pupilRatio: 0.43,
      lid: p.lid,
      depth: 5,
      visible: true,
      local: { u, v },
    });
  }
  // soft L6 clamp to keep eye radii from overlapping
  let eyeRepair = 0;
  for (let i = 0; i < eyes.length; i++) {
    let limit = Math.min(
      p.headSize * 0.16,
      Math.min(head.rx, head.ry) *
        (0.92 - Math.hypot(eyes[i].local.u, eyes[i].local.v)) *
        0.85,
    );
    for (let j = 0; j < eyes.length; j++)
      if (i !== j)
        limit = Math.min(
          limit,
          Math.hypot(
            eyes[i].transform.x - eyes[j].transform.x,
            eyes[i].transform.y - eyes[j].transform.y,
          ) / 2.7,
        );
    const before = eyes[i].radius;
    eyes[i].radius = before / Math.pow(1 + (before / limit) ** 6, 1 / 6);
    eyes[i].socketRadius = eyes[i].radius * 1.23;
    if (eyes[i].radius < before * 0.98) eyeRepair++;
  }
  const mouth = {
    type: p.mouth,
    x: head.x,
    y: head.y + head.ry * 0.62,
    size: head.rx * 0.33,
    z: 5,
  };
  if (["Beak", "Mandibles", "Proboscis", "Tube"].includes(p.mouth)) {
    const w = head.rx * 0.3;
    if (p.mouth === "Proboscis" || p.mouth === "Tube")
      ribbon(
        "mouth",
        [
          { x: mouth.x, y: mouth.y },
          { x: mouth.x + w * 0.4, y: mouth.y + head.ry * 0.8 },
        ],
        [w * 0.25, w * 0.12],
        4,
        "accent",
      );
    else
      polygon(
        "mouth",
        [
          { x: mouth.x - w, y: mouth.y },
          { x: mouth.x + w, y: mouth.y },
          { x: mouth.x, y: mouth.y + head.ry * 0.45 },
        ],
        4,
        "horn",
      );
  }
  const rotation = p.pose * 0.65 + p.phase * 0.15,
    cos = Math.cos(rotation),
    sin = Math.sin(rotation),
    visited = new Set(),
    rot = (q) => {
      if (visited.has(q)) return;
      visited.add(q);
      const x = q.x;
      q.x = x * cos - q.y * sin;
      q.y = x * sin + q.y * cos;
    };
  for (const a of parts) {
    if (a.shape === "ellipse") {
      rot(a);
      a.rotation += rotation;
    } else for (const q of a.points) rot(q);
  }
  for (const e of eyes) {
    rot(e.transform);
    e.transform.rotation += rotation;
  }
  for (const q of spine) rot(q);
  rot(head);
  head.rotation += rotation;
  rot(mouth);
  for (const l of limbs) for (const q of l.points) rot(q);
  return { parts, limbs, eyes, head, mouth, tail, spine, rotation, eyeRepair };
}
export function generateGrammar(seed) {
  const { genome, p } = parameters(seed),
    g = geometryOf(p),
    repair = repairSilhouette(g),
    motifs = p.motifCount === 1 ? [p.motif1] : [p.motif1, p.motif2];
  const rgb = oklchRGB(p.lightness, p.chroma, p.hue),
    accentRGB = oklchRGB(
      p.lightness * 0.78,
      p.chroma * 0.8,
      (p.hue + 60 + p.detail * 100) % 360,
    );
  const m = {
    bodyPlan: p.body,
    headModule: p.head,
    limbSet: p.limbSet,
    symmetry: p.symmetry,
    limbShape: p.limbShape,
    segmentCount: p.segments,
    limbCount: g.limbs.length,
    legCount: g.limbs.filter((l) => l.role === "leg").length,
    wingCount: p.wings ? 2 : 0,
    eyeCount: g.eyes.length,
    eyeStyle:
      p.eyeCount === 0 ? "None" : p.eyeCount === 1 ? "Central" : p.eyeStyle,
    pupil: p.eyeCount === 0 ? "None" : p.pupil,
    eyeSizeVariation:
      g.eyes.length < 2
        ? 0
        : (Math.max(...g.eyes.map((e) => e.radius)) -
            Math.min(...g.eyes.map((e) => e.radius))) /
          Math.max(...g.eyes.map((e) => e.radius)),
    mouth: p.mouth,
    tailPresent: p.tail,
    tailType: p.tail ? "Curved" : "None",
    tailBodyRatio: p.tail ? p.tailLength / p.length : 0,
    limbBodyRatio: g.limbs.length ? p.limbLength / p.length : 0,
    limbThicknessRatio: g.limbs.length ? p.limbWidth / p.width : 0,
    headBodyRatio: (p.headSize * 2) / p.length,
    neckBodyRatio: p.neck / p.length,
    bodyAspect:
      (g.bounds.maxY - g.bounds.minY) / (g.bounds.maxX - g.bounds.minX),
    hornCount: p.horns ? p.iconCount : 0,
    brightness: p.lightness,
    hue: p.hue,
    pattern: p.surface,
    contrast: p.surface === "Plain" ? 0 : p.contrast,
    diet: p.diet,
    medium: p.wings ? "Air" : p.tentacles ? "Water" : "Land",
    activity: p.activity,
    strategy: p.strategy,
    exploration: p.exploration,
    caution: p.caution,
    sociality: p.sociality,
    palette: "OKLCH",
    saturation: p.chroma / 0.2,
    ambientLight: p.light,
    relativeGravity: p.gravity,
    moisture: p.moisture,
    cover: p.cover,
    temperature: p.temperature,
    resources: p.resources,
    circularity: repair.metrics.circularity,
    radialVariance: repair.metrics.radialVariance,
    motif1: p.motif1,
    motif2: p.motifCount === 2 ? p.motif2 : "None",
    motifCount: p.motifCount,
    bodyLength: p.length,
    bodyWidth: p.width,
    headSize: p.headSize,
    limbLength: p.limbLength,
    pose: p.pose,
    wings: p.wings,
    horns: p.horns,
    tentacles: p.tentacles,
    antennae: p.antennae,
    crest: p.crest,
    extraLimbs: p.extraLimbs || g.limbs.length > 4,
  };
  const record = {
    identity: { version: "v2", generatorVersion: 2, seed },
    generatorVersion: 2,
    schemaVersion: 3,
    kind: "alien",
    phenotype: `${p.body}/${p.head}/${p.limbSet}/${p.symmetry}/${p.limbShape}`,
    genome,
    parameters: p,
    geometry: g,
    measurements: m,
    motifs,
    materials: {
      rgb,
      accentRGB,
      oklch: { l: p.lightness, c: p.chroma, h: p.hue },
      hue: p.hue,
      accentHue: (p.hue + 60 + p.detail * 100) % 360,
      detailHue: (p.hue + 180) % 360,
      saturation: 35 + p.chroma * 180,
      brightness: p.lightness * 75,
      contrast: p.surface === "Plain" ? 0 : p.contrast,
      pattern: p.surface,
      patternScale: p.patternScale,
      phase: p.phase / TAU,
      grain: p.detail,
    },
    environment: {
      light: p.light,
      gravity: p.gravity,
      moisture: p.moisture,
      cover: p.cover,
      temperature: p.temperature,
      resources: p.resources,
    },
    ecology: {
      diet: p.diet,
      medium: m.medium,
      activity: p.activity,
      strategy: p.strategy,
    },
    behavior: {
      exploration: p.exploration,
      caution: p.caution,
      sociality: p.sociality,
    },
    framing: { scale: p.frame, x: p.offsetX, y: p.offsetY },
    diagnostics: {
      repairs: { silhouette: repair.passes, eyes: g.eyeRepair },
      beforeRepair: repair.before,
      validation: [],
      units:
        "Reference proportions use developmental model units. Ecology is a speculative descriptor.",
    },
    equations: {
      code: seed,
      encoding: "bijective-genome",
      bits: Object.keys(genome.digits).length * 16,
    },
    provenance: [
      {
        rule: "modular-grammar",
        modules: {
          body: p.body,
          head: p.head,
          limbSet: p.limbSet,
          surface: p.surface,
        },
        repair: repair.passes,
      },
    ],
  };
  return record;
}
