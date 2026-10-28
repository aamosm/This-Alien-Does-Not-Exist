import { viewTransform } from "./view.js";
import { pigment as surfacePigment } from "./surface.js";
import { drawFeatures } from "./render.js";
import { clamp, hashKey, mix64 } from "./random.js";
function hash(x, y, s) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ s;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, s) {
  const a = Math.floor(x),
    b = Math.floor(y);
  let u = x - a,
    v = y - b;
  u = u * u * (3 - 2 * u);
  v = v * v * (3 - 2 * v);
  return (
    (hash(a, b, s) * (1 - u) + hash(a + 1, b, s) * u) * (1 - v) +
    (hash(a, b + 1, s) * (1 - u) + hash(a + 1, b + 1, s) * u) * v
  );
}
function rgb(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  });
}
const pause = () => new Promise((r) => setTimeout(r, 0));
export async function renderSkin(
  ctx,
  record,
  width,
  height,
  { isCancelled = () => false } = {},
) {
  const started = performance.now(),
    b = record.geometry.bounds,
    m = record.materials;
  const { scale, ox, oy } = viewTransform(record, width, height);
  const field = new Float32Array(width * height).fill(-1e6),
    materials = new Uint8Array(field.length);
  const X = (x) => x * scale + ox,
    Y = (y) => y * scale + oy;
  let surfaceOverlay = false,
    relief = 1,
    baseDepth = 0;
  function stamp(x, y, z, material) {
    const i = y * width + x,
      old = field[i],
      k = 1.7 * scale;
    if (surfaceOverlay) {
      if (old < -1e5) return;
      field[i] =
        old +
        relief *
          scale *
          (0.4 + 1.4 * Math.tanh(Math.max(0, z - baseDepth) / (3 * scale)));
      materials[i] = material;
      return;
    }
    if (z > old) {
      field[i] = z;
      materials[i] = material;
    }
    if (material === materials[i] && material === 0 && Math.abs(z - old) < k)
      field[i] += k * Math.pow(1 - Math.abs(z - old) / k, 2) * 0.25;
  }
  const bounds = (x0, y0, x1, y1) => [
    Math.max(0, Math.floor(x0)),
    Math.max(0, Math.floor(y0)),
    Math.min(width - 1, Math.ceil(x1)),
    Math.min(height - 1, Math.ceil(y1)),
  ];
  let partNo = 0;
  for (const p of record.geometry.parts) {
    if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
    const mat =
        p.material === "horn"
          ? 2
          : p.material === "membrane"
            ? 3
            : p.material === "accent"
              ? 1
              : 0,
      z = p.z * 7 * scale;
    surfaceOverlay = p.role === "motif" || p.role === "surface-segment";
    relief = p.relief ?? 1;
    baseDepth = z;
    if (p.shape === "ellipse") {
      const cx = X(p.x),
        cy = Y(p.y),
        rx = p.rx * scale,
        ry = p.ry * scale,
        r = Math.max(rx, ry),
        c = Math.cos(p.rotation),
        s = Math.sin(p.rotation),
        [x0, y0, x1, y1] = bounds(cx - r, cy - r, cx + r, cy + r);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx,
            dy = y + 0.5 - cy,
            u = (dx * c + dy * s) / rx,
            v = (-dx * s + dy * c) / ry,
            q = u * u + v * v;
          if (q < 1) stamp(x, y, z + Math.min(rx, ry) * Math.sqrt(1 - q), mat);
        }
    } else if (p.shape === "ribbon") {
      for (let j = 1; j < p.points.length; j++) {
        const a = p.points[j - 1],
          b = p.points[j],
          ax = X(a.x),
          ay = Y(a.y),
          bx = X(b.x),
          by = Y(b.y),
          r0 = p.radii[j - 1] * scale,
          r1 = p.radii[j] * scale,
          r = Math.max(r0, r1),
          dx = bx - ax,
          dy = by - ay,
          len = dx * dx + dy * dy || 1,
          [x0, y0, x1, y1] = bounds(
            Math.min(ax, bx) - r,
            Math.min(ay, by) - r,
            Math.max(ax, bx) + r,
            Math.max(ay, by) + r,
          );
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) {
            const t = clamp(((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / len),
              rr = r0 + (r1 - r0) * t,
              d2 = (x + 0.5 - ax - dx * t) ** 2 + (y + 0.5 - ay - dy * t) ** 2;
            if (d2 < rr * rr)
              stamp(
                x,
                y,
                z + (p.depthScale ?? 1) * Math.sqrt(rr * rr - d2),
                mat,
              );
          }
      }
    } else {
      const pts = p.points.map((q) => ({ x: X(q.x), y: Y(q.y) })),
        [x0, y0, x1, y1] = bounds(
          Math.min(...pts.map((q) => q.x)),
          Math.min(...pts.map((q) => q.y)),
          Math.max(...pts.map((q) => q.x)),
          Math.max(...pts.map((q) => q.y)),
        );
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          let inside = false,
            minEdge = Infinity;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[i],
              b = pts[j];
            if (
              a.y > y !== b.y > y &&
              x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
            )
              inside = !inside;
            const dx = b.x - a.x,
              dy = b.y - a.y,
              t = clamp(
                ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1),
              );
            minEdge = Math.min(
              minEdge,
              Math.hypot(x - a.x - dx * t, y - a.y - dy * t),
            );
          }
          if (inside)
            stamp(
              x,
              y,
              z +
                (p.depth
                  ? p.depth *
                    scale *
                    Math.tanh(minEdge / (p.depth * scale * 0.75))
                  : Math.min(mat === 3 ? 2 : 8, minEdge * 0.6) * scale),
              mat,
            );
        }
    }
    if (++partNo % 8 === 0) await pause();
  }
  const image = ctx.createImageData(width, height),
    pixels = image.data,
    seed = Number(mix64(hashKey(record.identity.seed + "|skin")) & 0xffffffffn);
  const base = m.rgb ?? rgb(m.hue, m.saturation * 0.78, m.brightness),
    accent =
      m.accentRGB ?? rgb(m.accentHue, m.saturation * 0.75, m.brightness * 0.7),
    horn = rgb(m.hue, 18, 30);
  const at = (x, y, fallback) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return fallback;
    const v = field[y * width + x];
    return v < -1e5 ? fallback : v;
  };
  for (let y = 0; y < height; y++) {
    if (y % 32 === 0) {
      if (isCancelled()) throw new DOMException("Cancelled", "AbortError");
      await pause();
    }
    for (let x = 0; x < width; x++) {
      const i = y * width + x,
        k = i * 4,
        h = field[i];
      pixels[k + 3] = 255;
      if (h < -1e5) {
        const shadow = at(x - 5, y - 8, -1e6) > -1e5 ? 19 : 22;
        pixels[k] = pixels[k + 1] = pixels[k + 2] = shadow;
        continue;
      }
      const wx = (x - ox) / scale,
        wy = (y - oy) / scale,
        mat = materials[i],
        fine = noise(wx * 1.8, wy * 1.8, seed),
        broad = noise(wx * 0.09, wy * 0.09, seed + 47),
        micro = noise(wx * 0.65, wy * 0.65, seed + 7);
      let nx = (at(x - 1, y, h) - at(x + 1, y, h)) * 0.5,
        ny = (at(x, y - 1, h) - at(x, y + 1, h)) * 0.5;
      if (mat !== 2) {
        nx += (noise((wx + 0.6) * 1.8, wy * 1.8, seed) - fine) * 0.23;
        ny += (noise(wx * 1.8, (wy + 0.6) * 1.8, seed) - fine) * 0.23;
      }
      const inv = 1 / Math.hypot(nx, ny, 1);
      nx *= inv;
      ny *= inv;
      const nz = inv;
      const diffuse = Math.max(0, nx * -0.43 + ny * -0.55 + nz * 0.715),
        spec = Math.pow(
          Math.max(0, nx * -0.23 + ny * -0.3 + nz * 0.926),
          mat === 2 ? 30 : 22,
        );
      let occ = 0,
        shadow = 1;
      for (const d of [4, 10, 22]) {
        const a = at(x - d, y, h),
          bb = at(x + d, y, h),
          c = at(x, y - d, h),
          dd = at(x, y + d, h);
        occ += Math.max(0, a - h, bb - h, c - h, dd - h) / (d * 4);
        if (
          at(x - Math.round(d * 0.6), y - Math.round(d * 0.8), h) >
          h + d * 1.3
        )
          shadow *= 0.8;
      }
      const ao = 1 - Math.min(0.45, occ * 0.32),
        rim = Math.pow(1 - nz, 3) * 0.09,
        light = (0.25 + diffuse * 0.9 * shadow) * ao + rim;
      const u = wx / m.patternScale,
        v = wy / m.patternScale;
      const pigment = surfacePigment(m.pattern, u, v, m.phase, (a, b) =>
        noise(a, b, seed),
      );
      const pores = mat === 2 ? 0 : Math.max(0, 0.37 - fine) * 0.3,
        variation = 1 + (broad - 0.5) * 0.16 + (micro - 0.5) * 0.07 - pores;
      for (let c = 0; c < 3; c++) {
        const colour = mat === 2 ? horn[c] : mat === 1 ? accent[c] : base[c],
          pattern = mat === 2 ? 0 : pigment * m.contrast;
        const albedo = colour * (1 - pattern) + accent[c] * pattern;
        const warm = c === 0 ? 1.025 : c === 1 ? 1 : 0.97;
        pixels[k + c] = clamp(
          albedo * light * variation * warm +
            spec * (mat === 2 ? 26 : 38) * (1 - pores) +
            (mat === 3 ? 5 : 0),
          0,
          255,
        );
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(image, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  drawFeatures(ctx, record, {
    eyeLight: (eye) => {
      const x = Math.round(X(eye.transform.x)),
        y = Math.round(Y(eye.transform.y)),
        h = at(x, y, 0);
      return 1 - Math.min(0.5, Math.max(0, at(x - 4, y - 6, h) - h) * 0.03);
    },
  });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return {
    renderMs: performance.now() - started,
    width,
    height,
    parts: record.geometry.parts.length,
  };
}
