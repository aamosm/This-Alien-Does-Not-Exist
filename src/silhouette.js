import { SILHOUETTE_CENTRES } from "./silhouette-clusters.js";
export const CIRCULARITY_MAX = 0.8,
  RADIAL_VARIANCE_MIN = 0.012;
export function boundsOf(geometry) {
  const b = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const p of geometry.parts) {
    if (p.shape === "ellipse") {
      const c = Math.cos(p.rotation),
        s = Math.sin(p.rotation),
        x = Math.hypot(p.rx * c, p.ry * s),
        y = Math.hypot(p.rx * s, p.ry * c);
      b.minX = Math.min(b.minX, p.x - x);
      b.maxX = Math.max(b.maxX, p.x + x);
      b.minY = Math.min(b.minY, p.y - y);
      b.maxY = Math.max(b.maxY, p.y + y);
    } else
      for (let i = 0; i < p.points.length; i++) {
        const q = p.points[i],
          r = p.radii?.[i] ?? 0;
        b.minX = Math.min(b.minX, q.x - r);
        b.maxX = Math.max(b.maxX, q.x + r);
        b.minY = Math.min(b.minY, q.y - r);
        b.maxY = Math.max(b.maxY, q.y + r);
      }
  }
  return b;
}
export function silhouette(geometry, size = 64) {
  const b = geometry.bounds ?? boundsOf(geometry),
    span = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1.08,
    cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2,
    scale = span / size,
    mask = new Uint8Array(size * size);
  for (const p of geometry.parts) {
    const pb = boundsOf({ parts: [p] }),
      x0 = Math.max(0, Math.floor((pb.minX - cx) / scale + size / 2)),
      x1 = Math.min(size - 1, Math.ceil((pb.maxX - cx) / scale + size / 2)),
      y0 = Math.max(0, Math.floor((pb.minY - cy) / scale + size / 2)),
      y1 = Math.min(size - 1, Math.ceil((pb.maxY - cy) / scale + size / 2)),
      c = Math.cos(p.rotation ?? 0),
      s = Math.sin(p.rotation ?? 0);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const ix = y * size + x;
        if (mask[ix]) continue;
        const wx = cx + (x + 0.5 - size / 2) * scale,
          wy = cy + (y + 0.5 - size / 2) * scale;
        let inside = false;
        if (p.shape === "ellipse") {
          const dx = wx - p.x,
            dy = wy - p.y;
          inside =
            ((dx * c + dy * s) / p.rx) ** 2 +
              ((-dx * s + dy * c) / p.ry) ** 2 <=
            1;
        } else if (p.shape === "ribbon")
          for (let j = 1; j < p.points.length && !inside; j++) {
            const a = p.points[j - 1],
              z = p.points[j],
              dx = z.x - a.x,
              dy = z.y - a.y,
              t = Math.max(
                0,
                Math.min(
                  1,
                  ((wx - a.x) * dx + (wy - a.y) * dy) /
                    (dx * dx + dy * dy || 1),
                ),
              ),
              r = p.radii[j - 1] * (1 - t) + p.radii[j] * t;
            inside =
              (wx - a.x - dx * t) ** 2 + (wy - a.y - dy * t) ** 2 <= r * r;
          }
        else
          for (
            let i = 0, j = p.points.length - 1;
            i < p.points.length;
            j = i++
          ) {
            const a = p.points[i],
              z = p.points[j];
            if (
              a.y > wy !== z.y > wy &&
              wx < ((z.x - a.x) * (wy - a.y)) / (z.y - a.y) + a.x
            )
              inside = !inside;
          }
        if (inside) mask[ix] = 1;
      }
  }
  let area = 0,
    mx = 0,
    my = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (mask[y * size + x]) {
        area++;
        mx += x;
        my += y;
      }
  mx /= area || 1;
  my /= area || 1;
  const at = (x, y) =>
    x < 0 || y < 0 || x >= size || y >= size ? 0 : mask[y * size + x];
  let axis = 0,
    diagonal = 0;
  const radii = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = at(x, y);
      axis += Math.abs(a - at(x + 1, y)) + Math.abs(a - at(x, y + 1));
      diagonal +=
        Math.abs(a - at(x + 1, y + 1)) + Math.abs(a - at(x - 1, y + 1));
      if (
        a &&
        (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1))
      )
        radii.push(Math.hypot(x - mx, y - my));
    }
  const perimeter = (Math.PI / 8) * (axis + diagonal / Math.SQRT2),
    mean = radii.reduce((s, r) => s + r, 0) / (radii.length || 1),
    variance =
      radii.reduce((s, r) => s + (r - mean) ** 2, 0) /
      (radii.length || 1) /
      (mean * mean || 1),
    circularity = (4 * Math.PI * area) / (perimeter * perimeter || 1);
  return {
    mask,
    area: area * scale * scale,
    perimeter: perimeter * scale,
    circularity,
    radialVariance: variance,
    size,
  };
}
export function stretchGeometry(g, sx, sy) {
  const visited = new Set(),
    point = (q) => {
      if (!q || visited.has(q)) return;
      visited.add(q);
      q.x *= sx;
      q.y *= sy;
    };
  for (const p of g.parts) {
    if (p.shape === "ellipse") {
      point(p);
      const c = Math.cos(p.rotation),
        s = Math.sin(p.rotation),
        a = sx * sx * (p.rx * p.rx * c * c + p.ry * p.ry * s * s),
        b = sx * sy * (p.rx * p.rx - p.ry * p.ry) * s * c,
        d = sy * sy * (p.rx * p.rx * s * s + p.ry * p.ry * c * c),
        v = Math.sqrt((a - d) ** 2 + 4 * b * b);
      p.rx = Math.sqrt((a + d + v) / 2);
      p.ry = Math.sqrt((a + d - v) / 2);
      p.rotation = 0.5 * Math.atan2(2 * b, a - d);
    } else for (const q of p.points) point(q);
  }
  for (const e of g.eyes ?? []) point(e.transform);
  point(g.head);
  point(g.mouth);
  for (const l of g.limbs ?? []) for (const q of l.points) point(q);
  g.bounds = boundsOf(g);
}
export function repairSilhouette(g) {
  g.bounds = boundsOf(g);
  let metrics = silhouette(g),
    passes = 0;
  const before = {
    circularity: metrics.circularity,
    radialVariance: metrics.radialVariance,
  };
  while (
    (metrics.circularity > CIRCULARITY_MAX ||
      metrics.radialVariance < RADIAL_VARIANCE_MIN) &&
    passes < 4
  ) {
    const tall = g.bounds.maxY - g.bounds.minY >= g.bounds.maxX - g.bounds.minX;
    stretchGeometry(g, tall ? 1 : 1.8, tall ? 1.8 : 1);
    metrics = silhouette(g);
    passes++;
  }
  if (
    metrics.circularity > CIRCULARITY_MAX ||
    metrics.radialVariance < RADIAL_VARIANCE_MIN
  )
    throw new Error(
      "Silhouette repair could not produce a non-circular entity.",
    );
  return { before, passes, metrics };
}
export function silhouetteVector(g) {
  const { mask } = silhouette(g, 32),
    vector = [];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      vector.push(
        (mask[y * 2 * 32 + x * 2] +
          mask[y * 2 * 32 + x * 2 + 1] +
          mask[(y * 2 + 1) * 32 + x * 2] +
          mask[(y * 2 + 1) * 32 + x * 2 + 1]) /
          4,
      );
  const norm = Math.hypot(...vector) || 1;
  return vector.map((v) => v / norm);
}
export function silhouetteCluster(g) {
  if (!SILHOUETTE_CENTRES.length)
    throw new Error(
      "Silhouette prototypes are missing. Run the explicit cluster training command.",
    );
  const vector = silhouetteVector(g);
  let closest = 0,
    distance = Infinity;
  for (let i = 0; i < SILHOUETTE_CENTRES.length; i++) {
    const centre = SILHOUETTE_CENTRES[i];
    let d = 0;
    for (let j = 0; j < vector.length; j++) d += (vector[j] - centre[j]) ** 2;
    if (d < distance) {
      distance = d;
      closest = i;
    }
  }
  return closest;
}
export function silhouetteSignature(g, motifs) {
  return `c${silhouetteCluster(g)}:${[...motifs].sort().join("|")}`;
}
