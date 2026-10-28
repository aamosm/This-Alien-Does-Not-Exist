import { D, piProgress } from "./pi.js";
import { drawFeatures } from "./render.js";
const limbs = [
  [-0.19, -0.43, -0.38, -0.04, 0.075],
  [-0.38, -0.04, -0.43, 0.31, 0.062],
  [0.19, -0.43, 0.38, -0.04, 0.075],
  [0.38, -0.04, 0.43, 0.31, 0.062],
  [-0.115, 0.21, -0.14, 0.68, 0.092],
  [-0.14, 0.68, -0.17, 1.1, 0.07],
  [0.115, 0.21, 0.14, 0.68, 0.092],
  [0.14, 0.68, 0.17, 1.1, 0.07],
  [0, -0.56, 0, -0.67, 0.085],
  [0, -0.43, 0, 0.18, 0.22],
];
function capsule(x, y, a, b, c, d, r) {
  const dx = c - a,
    dy = d - b,
    t = Math.max(
      0,
      Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy)),
    );
  return Math.hypot(x - a - dx * t, y - b - dy * t) - r;
}
export function humanSDF(x, y) {
  let d = Math.hypot(x, y + 0.86) - 0.18;
  for (const l of limbs) d = Math.min(d, capsule(x, y, ...l));
  d = Math.min(
    d,
    capsule(x, y, -0.17, 1.1, -0.24, 1.11, 0.07),
    capsule(x, y, 0.17, 1.1, 0.24, 1.11, 0.07),
  );
  return d;
}
// numerical area integral of humanSDF to preserve shape area
export const HUMAN_AREA = 1.017417555556277;
export const CIRCLE_RADIUS = Math.sqrt(HUMAN_AREA / Math.PI);
export function pathSDF(x, y, t) {
  return (1 - t) * humanSDF(x, y) + t * (Math.hypot(x, y) - CIRCLE_RADIUS);
}
export function piRecord(seed, m) {
  const t = piProgress(m),
    fade = 1 - t;
  const claims = [
    {
      id: "path-anatomy",
      section: "Morphology",
      kind: "Measured",
      text: "Biped body; 4 limbs in an upright stance typical of human specimens.",
      evidence: [{ path: "measurements.limbCount", value: 4 }],
    },
    {
      id: "path-eyes",
      section: "Morphology",
      kind: "Measured",
      text: "2 eyes in a paired forward-facing arrangement; round pupils.",
      evidence: [{ path: "measurements.eyeCount", value: 2 }],
    },
    {
      id: "path-mouth",
      section: "Morphology",
      kind: "Measured",
      text: "Jaw feeding structure.",
      evidence: [{ path: "measurements.mouth", value: "Jaw" }],
    },
    {
      id: "path-tail",
      section: "Morphology",
      kind: "Measured",
      text: "No tail is present.",
      evidence: [{ path: "measurements.tailPresent", value: false }],
    },
    {
      id: "path-surface",
      section: "Surface",
      kind: "Measured",
      text: "Plain pigmentation across an unarmored surface.",
      evidence: [{ path: "measurements.pattern", value: "Plain" }],
    },
    {
      id: "path-feeding",
      section: "Ecology",
      kind: "Model",
      text: "The ecological model assigns an omnivore feeding role and a foraging strategy.",
      evidence: [{ path: "ecology.diet", value: "omnivore" }],
    },
    {
      id: "path-activity",
      section: "Ecology",
      kind: "Model",
      text: "Diurnal activity preference in a terrestrial environment.",
      evidence: [{ path: "ecology.activity", value: "diurnal" }],
    },
    {
      id: "path-caution",
      section: "Behaviour",
      kind: "Model",
      text: "Caution is moderate; social tendency is group-oriented.",
      evidence: [{ path: "behavior.sociality", value: "group-oriented" }],
    },
  ];
  return {
    identity: { version: "v2", generatorVersion: 2, seed, pi: m },
    generatorVersion: 2,
    schemaVersion: 3,
    kind: "pi-path",
    phenotype: "pi-path",
    pi: { m, D, t },
    measurements: {
      progress: t,
      piDigits: m,
      eyeCount: t === 1 ? 0 : 2,
      limbCount: t === 1 ? 0 : 4,
      bodyPlan: t === 0 ? "Biped" : t === 1 ? "Circle" : "Transition",
      mouth: t === 1 ? null : "Jaw",
      tailPresent: false,
      pattern: "Plain",
    },
    ecology: {
      diet: "omnivore",
      activity: "diurnal",
      strategy: "foraging",
      medium: "land",
    },
    behavior: {
      sociality: "group-oriented",
      caution: "moderate",
      exploration: 0.72,
    },
    materials: { hue: 25, detailHue: 40, saturation: 15, brightness: 65 },
    geometry: {
      bounds: { minX: -1.3, minY: -1.3, maxX: 1.3, maxY: 1.3 },
      parts: [],
      eyes: [],
      mouth: {},
    },
    claims: t === 1 ? [] : claims.slice(0, Math.ceil(claims.length * fade)),
    diagnostics: { validation: [], repairs: {} },
    shapeSignature: null,
  };
}
export async function renderPi(
  ctx,
  record,
  width,
  height,
  { isCancelled = () => false, quick = false } = {},
) {
  const t = record.pi.t,
    scale = Math.min(width, height) / 2.65;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#161616";
  ctx.fillRect(0, 0, width, height);
  if (t === 1) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, CIRCLE_RADIUS * scale, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const image = ctx.createImageData(width, height),
    pixels = image.data;
  for (let y = 0; y < height; y++) {
    if (y % 32 === 0 && !quick) {
      if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
      await new Promise((r) => setTimeout(r, 0));
    }
    for (let x = 0; x < width; x++) {
      const wx = (x + 0.5 - width / 2) / scale,
        wy = (y + 0.5 - height / 2) / scale,
        d = pathSDF(wx, wy, t),
        i = (y * width + x) * 4;
      pixels[i + 3] = 255;
      if (d > 0) {
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 22;
        continue;
      }
      const e = 0.003,
        nx = (pathSDF(wx + e, wy, t) - pathSDF(wx - e, wy, t)) / (2 * e),
        ny = (pathSDF(wx, wy + e, t) - pathSDF(wx, wy - e, t)) / (2 * e),
        slope = Math.exp(d * 25),
        nz = Math.sqrt(
          Math.max(0, 1 - Math.min(0.95, (nx * nx + ny * ny) * slope * slope)),
        ),
        light =
          0.38 +
          0.62 *
            Math.max(0, -nx * slope * 0.43 - ny * slope * 0.55 + nz * 0.715),
        grainScale = 1 / Math.max(0.025, 1 - t),
        grain = quick
          ? 0
          : Math.sin(wx * 291 * grainScale) *
            Math.sin(wy * 347 * grainScale) *
            2.8 *
            (1 - t),
        shade = (1 - t) * (quick ? 150 : 190 * light + grain);
      pixels[i] = shade * 1.03;
      pixels[i + 1] = shade;
      pixels[i + 2] = shade * 0.94;
    }
  }
  ctx.putImageData(image, 0, 0);
  const fade = 1 - t;
  if (fade > 0.001) {
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.setTransform(scale, 0, 0, scale, width / 2, height / 2);
    const headY = -0.86 * fade;
    const face = {
      ...record,
      geometry: {
        mouth: { type: "Jaw", x: 0, y: headY + 0.08 * fade, size: 0.06 * fade },
        eyes: [-1, 1].map((side) => ({
          transform: {
            x: side * 0.068 * fade,
            y: headY - 0.015 * fade,
            rotation: 0,
          },
          radius: 0.018 * fade,
          socketRadius: 0.022 * fade,
          pupil: "round",
          irisRatio: 0.55,
          pupilRatio: 0.45,
          lid: 0.1,
          depth: 5,
          visible: true,
        })),
      },
    };
    drawFeatures(ctx, face);
    ctx.restore();
  }
}
