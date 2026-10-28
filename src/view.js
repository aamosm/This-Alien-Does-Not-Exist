export function viewTransform(record, width, height) {
  const b = record.geometry.bounds,
    f = record.framing ?? { scale: 0.82, x: 0, y: 0 },
    scale = Math.min(
      (width * f.scale) / (b.maxX - b.minX),
      (height * f.scale) / (b.maxY - b.minY),
    );
  return {
    scale,
    ox: width * (0.5 + f.x) - ((b.minX + b.maxX) / 2) * scale,
    oy: height * (0.5 + f.y) - ((b.minY + b.maxY) / 2) * scale,
  };
}
