import { clamp } from "./random.js";
import { boundsOf, silhouetteVector } from "./silhouette.js";
// Compare anatomy without letting markings or small decorative motifs disguise a clone.
export function anatomyVector(geometry) {
  const parts = geometry.parts.filter(
    (p) => !p.role?.startsWith("motif") && p.role !== "surface-segment",
  );
  return silhouetteVector({ parts, bounds: boundsOf({ parts }) });
}
export function outlineDistance(a, b) {
  return a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
}
export function shapeSignature(geometry) {
  const b = geometry.bounds,
    cx = (b.minX + b.maxX) / 2,
    cy = (b.minY + b.maxY) / 2,
    scale = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) || 1;
  const values = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI) / 8,
      dx = Math.cos(angle),
      dy = Math.sin(angle);
    let support = 0;
    for (const part of geometry.parts) {
      if (part.shape === "ellipse") {
        const a = angle - part.rotation;
        support = Math.max(
          support,
          (part.x - cx) * dx +
            (part.y - cy) * dy +
            Math.hypot(part.rx * Math.cos(a), part.ry * Math.sin(a)),
        );
      } else
        part.points.forEach((p, j) => {
          support = Math.max(
            support,
            (p.x - cx) * dx + (p.y - cy) * dy + (part.radii?.[j] || 0),
          );
        });
    }
    return clamp(support / scale);
  });
  return {
    method: "support-envelope@1",
    values,
    anatomy: anatomyVector(geometry),
  };
}
