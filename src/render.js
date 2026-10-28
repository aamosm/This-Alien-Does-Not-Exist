import { viewTransform } from "./view.js";
import { rgbCSS } from "./colour.js";
import { pigment } from "./surface.js";
import { stream } from "./random.js";
const TAU = Math.PI * 2;
function outline(ctx, p) {
  ctx.beginPath();
  if (p.shape === "ellipse") {
    ctx.ellipse(p.x, p.y, p.rx, p.ry, p.rotation, 0, TAU);
    return;
  }
  if (p.shape === "polygon") {
    p.points.forEach((v, i) =>
      i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y),
    );
    ctx.closePath();
    return;
  }
  const left = [],
    right = [];
  p.points.forEach((v, i) => {
    const a = p.points[Math.max(0, i - 1)],
      b = p.points[Math.min(p.points.length - 1, i + 1)],
      dx = b.x - a.x,
      dy = b.y - a.y,
      l = Math.hypot(dx, dy) || 1;
    left.push({
      x: v.x - (dy / l) * p.radii[i],
      y: v.y + (dx / l) * p.radii[i],
    });
    right.push({
      x: v.x + (dy / l) * p.radii[i],
      y: v.y - (dx / l) * p.radii[i],
    });
  });
  const a = p.points[0],
    b = p.points[1],
    z = p.points.at(-1),
    y = p.points.at(-2),
    l0 = Math.hypot(b.x - a.x, b.y - a.y) || 1,
    l1 = Math.hypot(z.x - y.x, z.y - y.y) || 1;
  const startCap = {
      x: a.x - ((b.x - a.x) / l0) * p.radii[0],
      y: a.y - ((b.y - a.y) / l0) * p.radii[0],
    },
    endCap = {
      x: z.x + ((z.x - y.x) / l1) * p.radii.at(-1),
      y: z.y + ((z.y - y.y) / l1) * p.radii.at(-1),
    };
  const points = left.concat([endCap], right.reverse(), [startCap]),
    last = points.at(-1),
    first = points[0];
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  ctx.closePath();
}
function partBounds(p) {
  if (p.shape === "ellipse") {
    const r = Math.max(p.rx, p.ry);
    return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
  }
  const r = Math.max(...(p.radii || [0]));
  const xs = p.points.map((p) => p.x),
    ys = p.points.map((p) => p.y);
  return {
    x: Math.min(...xs) - r,
    y: Math.min(...ys) - r,
    w: Math.max(...xs) - Math.min(...xs) + 2 * r,
    h: Math.max(...ys) - Math.min(...ys) + 2 * r,
  };
}
function canvasFactory(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function materialPattern(ctx, record, makeCanvas) {
  const m = record.materials;
  if (m.pattern === "Plain" || !m.contrast) return null;
  const c = makeCanvas(128, 128),
    p = c.getContext("2d"),
    image = p.createImageData(128, 128),
    rgb = m.accentRGB ?? [60, 70, 70];
  const textureSeed = stream(record.identity.seed, "surface")("phase") * 1000;
  const noise = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + textureSeed) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const k = (y * 128 + x) * 4,
        a = pigment(
          m.pattern,
          x / m.patternScale,
          y / m.patternScale,
          m.phase,
          noise,
        );
      for (let j = 0; j < 3; j++) image.data[k + j] = rgb[j];
      image.data[k + 3] = a * 255;
    }
  p.putImageData(image, 0, 0);
  return ctx.createPattern(c, "repeat");
}
function drawEye(ctx, eye, record, eyeLight = 1) {
  const { x, y, rotation } = eye.transform,
    rr = eye.radius,
    m = record.materials;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = `hsl(${m.hue} ${m.saturation * 0.6}% ${Math.max(8, m.brightness - 22)}%)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, eye.socketRadius, eye.socketRadius * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, rr, rr * (1 - eye.lid), 0, 0, TAU);
  ctx.clip();
  const grad = ctx.createRadialGradient(
    -rr * 0.35,
    -rr * 0.4,
    rr * 0.05,
    0,
    0,
    rr * 1.1,
  );
  grad.addColorStop(0, "#eee9d5");
  grad.addColorStop(0.6, "#bbbca5");
  grad.addColorStop(1, "#4b544e");
  ctx.fillStyle = grad;
  ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
  const iris = rr * eye.irisRatio;
  const ig = ctx.createRadialGradient(0, 0, iris * 0.1, 0, 0, iris);
  ig.addColorStop(0, `hsl(${m.detailHue} 80% 23%)`);
  ig.addColorStop(0.75, `hsl(${m.detailHue} 70% 58%)`);
  ig.addColorStop(1, "#102222");
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.arc(0, 0, iris, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(15,26,30,.35)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 18; i++) {
    const a = (i * TAU) / 18;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * iris * 0.4, Math.sin(a) * iris * 0.4);
    ctx.lineTo(Math.cos(a) * iris * 0.94, Math.sin(a) * iris * 0.94);
    ctx.stroke();
  }
  ctx.fillStyle = "#071114";
  ctx.beginPath();
  const pupil = iris * eye.pupilRatio;
  if (["star", "diamond", "triangle", "square"].includes(eye.pupil)) {
    const count = eye.pupil === "star" ? 10 : eye.pupil === "triangle" ? 3 : 4;
    for (let i = 0; i < count; i++) {
      const a =
          (i * Math.PI * 2) / count +
          (eye.pupil === "square" ? Math.PI / 4 : 0),
        rad = eye.pupil === "star" && i % 2 ? pupil * 0.4 : pupil;
      const xx = Math.cos(a) * rad,
        yy = Math.sin(a) * rad;
      i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.closePath();
  } else if (eye.pupil === "double") {
    for (const side of [-1, 1]) {
      ctx.moveTo(side * pupil * 0.6 + pupil * 0.38, 0);
      ctx.ellipse(side * pupil * 0.6, 0, pupil * 0.38, pupil * 0.75, 0, 0, TAU);
    }
  } else if (eye.pupil === "ring" || eye.pupil === "crescent") {
    ctx.arc(0, 0, pupil, 0, TAU);
    ctx.moveTo(pupil * 0.6 + (eye.pupil === "crescent" ? pupil * 0.5 : 0), 0);
    ctx.arc(
      eye.pupil === "crescent" ? pupil * 0.5 : 0,
      0,
      pupil * 0.6,
      0,
      TAU,
      true,
    );
  } else
    ctx.ellipse(
      0,
      0,
      pupil *
        (eye.pupil === "slit"
          ? 0.24
          : eye.pupil === "oval"
            ? 0.6
            : eye.pupil === "pinpoint"
              ? 0.4
              : 1),
      pupil * (eye.pupil === "horizontal" ? 0.27 : 1),
      0,
      0,
      TAU,
    );
  ctx.fill();
  const shade = ctx.createLinearGradient(
    -rr * 0.6,
    -rr * 0.8,
    rr * 0.6,
    rr * 0.8,
  );
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(0.45, `rgba(0,0,0,${0.08 + (1 - eyeLight) * 0.3})`);
  shade.addColorStop(1, "rgba(0,0,0,.68)");
  ctx.fillStyle = shade;
  ctx.fillRect(-rr, -rr, rr * 2, rr * 2);
  const lidShadow = ctx.createLinearGradient(0, -rr, 0, 0);
  lidShadow.addColorStop(0, "rgba(0,0,0,.52)");
  lidShadow.addColorStop(0.55, "rgba(0,0,0,0)");
  ctx.fillStyle = lidShadow;
  ctx.fillRect(-rr, -rr, rr * 2, rr);
  ctx.fillStyle = "rgba(255,255,245,.62)";
  ctx.beginPath();
  ctx.ellipse(-rr * 0.28, -rr * 0.35, rr * 0.17, rr * 0.1, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}
export function render(
  ctx,
  record,
  width,
  height,
  { makeCanvas = canvasFactory, background = true, grid = false } = {},
) {
  const start = performance.now(),
    b = record.geometry.bounds,
    m = record.materials;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "#ffffff06";
    ctx.lineWidth = 1;
    for (let x = 0; grid && x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; grid && y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
  const { scale, ox, oy } = viewTransform(record, width, height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  const pattern = materialPattern(ctx, record, makeCanvas);
  for (const part of record.geometry.parts) {
    const box = partBounds(part);
    ctx.save();
    outline(ctx, part);
    const dark = part.z < 0 ? -12 : 0,
      horn = part.material === "horn",
      membrane = part.material === "membrane";
    const hue = part.material === "accent" ? m.accentHue : m.hue;
    const light = horn ? 24 : m.brightness + dark;
    const gradient = ctx.createLinearGradient(
      box.x,
      box.y,
      box.x + Math.max(1, box.w),
      box.y + Math.max(1, box.h),
    );
    if (m.rgb) {
      const base = part.material === "accent" ? m.accentRGB : m.rgb;
      gradient.addColorStop(0, rgbCSS(base.map((v) => v * 1.22)));
      gradient.addColorStop(
        0.43,
        rgbCSS(base.map((v) => v * (part.z < 0 ? 0.67 : 1))),
      );
      gradient.addColorStop(1, rgbCSS(base.map((v) => v * 0.42)));
    } else {
      gradient.addColorStop(0, `hsl(${hue} ${m.saturation}% ${light + 15}%)`);
      gradient.addColorStop(
        1,
        `hsl(${hue} ${m.saturation}% ${Math.max(8, light - 20)}%)`,
      );
    }
    ctx.fillStyle = gradient;
    if (membrane) ctx.globalAlpha = 0.65;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `hsla(${hue},35%,10%,.35)`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    if (pattern && !horn) {
      ctx.clip();
      ctx.globalAlpha = m.contrast;
      ctx.fillStyle = pattern;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    ctx.restore();
  }
  drawFeatures(ctx, record);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {
    renderMs: performance.now() - start,
    width,
    height,
    parts: record.geometry.parts.length,
  };
}

export function drawFeatures(ctx, record, { eyeLight = () => 1 } = {}) {
  const mouth = record.geometry.mouth;
  if (!["Beak", "Mandibles", "Proboscis", "Tube"].includes(mouth.type)) {
    ctx.save();
    ctx.translate(mouth.x, mouth.y);
    ctx.fillStyle = "#101c1c";
    ctx.strokeStyle = "#101c1c";
    ctx.lineWidth = 1.5;
    if (["Jaw", "Slit", "Cleft", "Pucker", "Plate"].includes(mouth.type)) {
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        mouth.size,
        mouth.size *
          (mouth.type === "Pucker"
            ? 0.55
            : mouth.type === "Plate"
              ? 0.35
              : 0.18),
        mouth.type === "Cleft" ? -0.3 : 0,
        0,
        TAU,
      );
      ctx.fill();
    } else
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.ellipse(
          i * mouth.size * 0.4,
          0,
          mouth.size * 0.09,
          mouth.size * 0.45,
          0,
          0,
          TAU,
        );
        ctx.fill();
      }
    ctx.restore();
  }
  for (const eye of record.geometry.eyes
    .filter((e) => e.visible)
    .sort((a, b) => a.depth - b.depth))
    drawEye(ctx, eye, record, eyeLight(eye));
}
