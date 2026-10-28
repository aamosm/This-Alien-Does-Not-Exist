import AlienEngine from "./engine.js";
import { generateLegacy } from "./adapter.js";
import { drawEyes } from "./draw-eyes.js";
function compile(p) {
  if (p.type === "sphere") return (x, y) => Math.hypot(x - p.x, y - p.y) - p.r;
  if (p.type === "ellipsoid") {
    const c = Math.cos(-p.angle),
      s = Math.sin(-p.angle),
      min = Math.min(p.rx, p.ry);
    return (x, y) => {
      const dx = x - p.x,
        dy = y - p.y;
      return (
        (Math.hypot((dx * c - dy * s) / p.rx, (dx * s + dy * c) / p.ry) - 1) *
        min
      );
    };
  }
  if (p.type === "capsule") {
    const dx = p.bx - p.ax,
      dy = p.by - p.ay,
      L = Math.hypot(dx, dy),
      ux = dx / L,
      uy = dy / L,
      st = (p.r1 - p.r2) / L,
      ct = Math.sqrt(Math.max(0, 1 - st * st));
    if (L === 0)
      return (x, y) => Math.hypot(x - p.ax, y - p.ay) - Math.max(p.r1, p.r2);
    if (L <= Math.abs(p.r1 - p.r2))
      return p.r1 > p.r2
        ? (x, y) => Math.hypot(x - p.ax, y - p.ay) - p.r1
        : (x, y) => Math.hypot(x - p.bx, y - p.by) - p.r2;
    return (px, py) => {
      const tx = px - p.ax,
        ty = py - p.ay,
        y = tx * ux + ty * uy,
        x = Math.abs(-tx * uy + ty * ux),
        proj = y * ct - x * st;
      if (proj <= 0) return Math.hypot(x, y) - p.r1;
      if (proj >= L * ct) return Math.hypot(x, y - L) - p.r2;
      return x * ct + y * st - p.r1;
    };
  }
  return (x, y) => p.evaluate(x, y);
}
export function compiledField(primitives) {
  const items = primitives.map((p) => ({
    evaluate: compile(p),
    op: p.op,
    k: Math.max(0.0001, p.k),
  }));
  return (x, y) => {
    let d = Infinity;
    for (const p of items) {
      const v = p.evaluate(x, y);
      if (d === Infinity) d = p.op === "subtract" ? -v : v;
      else if (p.op === "add") d = Math.min(d, v);
      else if (p.op === "subtract") d = Math.max(d, -v);
      else {
        const m = Math.min(d, v);
        d =
          m - p.k * Math.log(Math.exp((m - d) / p.k) + Math.exp((m - v) / p.k));
      }
    }
    return d;
  };
}
export async function renderLegacy(
  ctx,
  seed,
  width,
  height,
  {
    isCancelled = () => false,
    yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
  } = {},
) {
  const start = performance.now(),
    alien = generateLegacy(seed),
    canvas = { width, height };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of alien.geometry.allBones) {
    const b = p.bounds();
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const aspect = (maxY - minY) / (maxX - minX),
    pct = aspect > 1.35 ? 0.16 : aspect < 0.75 ? 0.14 : 0.13;
  const padding = Math.max(
    48,
    Math.min(110, Math.round(Math.min(width, height) * pct)),
  );
  AlienEngine.fitToBounds(alien, width, height, padding);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const allBones = alien.geometry.allBones,
    head = alien.geometry.head;
  const [baseR, baseG, baseB] = alien.materials.baseColorRGB,
    [accR, accG, accB] = alien.materials.accentColorRGB,
    [hiR, hiG, hiB] = alien.materials.highlightColorRGB;
  const field = compiledField(allBones),
    stride = width + 1,
    distances = new Float32Array(stride * (height + 1));
  for (let y = 0; y <= height; y++) {
    if (y % 24 === 0) {
      if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
      await yieldTask();
    }
    for (let x = 0; x <= width; x++) distances[y * stride + x] = field(x, y);
  }
  const imgData = ctx.createImageData(width, height),
    data = imgData.data;
  const patType = alien.genome.skinPattern;
  const patStyle = alien.genome.patternStyle;
  const patContrast = alien.genome.patternContrast;
  const patScale = alien.materials.patternScaleMultiplier * (1 + patType * 2);

  const lx = -0.5,
    ly = -0.5,
    lz = 0.8;
  const flx = 0.65,
    fly = 0.45,
    flz = 0.35;

  const fbm2D = (x, y, octaves) => {
    let amp = 0.5,
      freq = 1,
      sum = 0,
      norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * AlienEngine.noise2D(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.15;
    }
    return sum / norm;
  };

  const computePatternMod = (px, py) => {
    if (patType < 0.25) {
      const n = fbm2D(px * patScale, py * patScale, 3);
      const thresh = 0.55 + patStyle * 0.15;
      return n > thresh ? Math.min(1, (n - thresh) * 5) : 0;
    }
    if (patType < 0.5) {
      const warp = fbm2D(px * patScale * 0.4, py * patScale * 0.4, 2) * 6;
      const s = Math.sin(px * patScale * (2 + patStyle * 4) + warp);
      return s > 0.25 ? Math.min(1, (s - 0.25) * 2) : 0;
    }
    if (patType < 0.75) {
      const freq = patScale * (2.2 + patStyle * 1.5);
      const row = Math.floor(py * freq);
      const rowOffset = (row % 2) * 0.5;
      const col = Math.floor(px * freq + rowOffset);
      const fx = px * freq + rowOffset - col - 0.5;
      const fy = py * freq - row - 0.5;
      let cellHash = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
      cellHash -= Math.floor(cellHash);
      const edge = 1 - Math.min(1, Math.hypot(fx, fy) * 1.8);
      return cellHash > 0.4 ? Math.max(0, edge) : 0;
    }
    return fbm2D(px * patScale, py * patScale, 4);
  };

  for (let y = 0; y < height; y++) {
    if (y % 48 === 0) {
      if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
      await yieldTask();
    }
    for (let x = 0; x < width; x++) {
      const d = distances[y * stride + x];
      if (d >= 1) continue;
      const dx = distances[y * stride + x + 1] - d,
        dy = distances[(y + 1) * stride + x] - d,
        n = Math.hypot(dx, dy, 1.5),
        nx = dx / n,
        ny = dy / n,
        nz = 1.5 / n;
      let intensity = 0.25 + Math.max(0, nx * lx + ny * ly + nz * lz) * 0.75;
      const fill = Math.max(0, nx * flx + ny * fly + nz * flz) * 0.16;
      if (head.headCenter && head.headR)
        intensity +=
          Math.max(
            0,
            1 -
              Math.hypot(x - head.headCenter.x, y - head.headCenter.y) /
                (head.headR * 3.5),
          ) * 0.15;
      const mod = computePatternMod(x, y) * patContrast,
        idx = (y * width + x) * 4;
      data[idx] = Math.min(
        255,
        (baseR * (1 - mod) + accR * mod) * intensity + hiR * fill,
      );
      data[idx + 1] = Math.min(
        255,
        (baseG * (1 - mod) + accG * mod) * intensity + hiG * fill,
      );
      data[idx + 2] = Math.min(
        255,
        (baseB * (1 - mod) + accB * mod) * intensity + hiB * fill,
      );
      data[idx + 3] = Math.max(0, Math.min(1, 1 - d)) * 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  drawEyes(
    ctx,
    alien.eyes,
    alien.geometry.eyePositions,
    alien.materials.baseColorRGB,
    alien.materials.eyeColorRGB,
  );
  return {
    renderMs: performance.now() - start,
    width,
    height,
    parts: allBones.length,
  };
}
