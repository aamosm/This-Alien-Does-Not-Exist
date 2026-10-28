const profiles = {
  Spindle: {
    length: 1.1,
    width: 0.48,
    form: "hull",
    widths: [0.15, 0.65, 1, 0.85, 0.4, 0.08],
  },
  Pear: {
    length: 0.82,
    width: 0.9,
    form: "round",
    widths: [0.25, 0.4, 0.7, 1, 0.75, 0.15],
  },
  Keel: {
    length: 0.82,
    width: 1.08,
    form: "hull",
    widths: [0.12, 0.92, 1.1, 0.65, 0.3, 0.04],
  },
  Crescent: {
    length: 0.92,
    width: 0.42,
    form: "round",
    widths: [0.3, 0.8, 1, 0.95, 0.65, 0.2],
  },
  Saddle: {
    length: 0.7,
    width: 1.05,
    form: "hull",
    widths: [0.25, 1.05, 0.48, 0.55, 1, 0.15],
  },
  Chevron: {
    length: 0.82,
    width: 0.85,
    form: "hull",
    widths: [0.12, 1.05, 0.9, 0.55, 0.35, 0.1],
  },
  Bean: {
    length: 0.72,
    width: 0.85,
    form: "round",
    widths: [0.25, 0.75, 1, 0.8, 0.6, 0.25],
  },
  Tapered: {
    length: 0.96,
    width: 0.9,
    form: "hull",
    widths: [0.8, 1, 0.7, 0.45, 0.25, 0.03],
  },
  Waisted: {
    length: 0.9,
    width: 0.78,
    form: "hull",
    widths: [0.2, 1, 0.35, 0.3, 0.85, 0.12],
  },
  Arched: {
    length: 0.95,
    width: 0.32,
    form: "round",
    widths: [0.5, 0.9, 1, 0.75, 0.6, 0.2],
  },
  Folded: {
    length: 1.0,
    width: 0.28,
    form: "jointed",
    widths: [0.35, 0.85, 0.7, 1, 0.55, 0.18],
  },
  Undulating: {
    length: 1.2,
    width: 0.25,
    form: "round",
    widths: [0.35, 1, 0.9, 0.7, 0.4, 0.06],
  },
};
const interpolate = (values, t) => {
  const x = t * (values.length - 1),
    i = Math.min(values.length - 2, Math.floor(x));
  return values[i] + (values[i + 1] - values[i]) * (x - i);
};
export function bodyScaffold(p) {
  const config = profiles[p.body],
    spine = [],
    radii = [],
    length = p.length * config.length * (0.78 + 0.44 * (p.bodyProfile ?? 0.5));
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    let x = Math.sin(t * Math.PI + p.phase * 0.12) * p.bend * length * 0.09;
    if (p.body === "Crescent")
      x +=
        (Math.cos((t - 0.5) * Math.PI * 1.35) - Math.cos(Math.PI * 0.675)) *
        length *
        0.38;
    if (p.body === "Arched")
      x += Math.sin(t * Math.PI) * length * (0.36 + 0.13 * p.bend);
    if (p.body === "Chevron")
      x += (Math.abs(t - 0.34) - 0.22) * length * (0.45 + 0.15 * p.bend);
    if (p.body === "Folded")
      x += interpolate([-0.18, 0.2, -0.13, 0.16], t) * length;
    if (p.body === "Undulating")
      x +=
        Math.sin(t * Math.PI * 2.3 + p.phase * 0.2) *
        length *
        (0.11 + 0.06 * p.bend);
    if (p.body === "Bean") x += Math.sin(t * Math.PI) * p.width * 0.5;
    const profile = p.bodyProfile ?? 0.5;
    x += 
      Math.sin(Math.PI*t)*
      Math.sin(t * Math.PI * (1.5+profile*2.5)+ p.phase) *
      length * 
      (0.025 +0.12 * Math.abs(p.bend));
    spine.push({x, y : (t-0.5)*length });
    radii.push(
      p.width *
        config.width *
        interpolate(config.widths, t ** (0.65 + 0.7 * profile)) *
        Math.exp((t - 0.5) * (p.taper - 0.5) * 2.8) *
        (0.72 + 0.55 * Math.sin(Math.PI * (t * 0.7 + profile * 0.3))) *
        (1 + p.lobes * 0.3 * Math.sin(t * Math.PI * p.segments + p.phase)),
    );
  }
  return {
    spine,
    radii,
    form: config.form,
    depth: p.width * config.width * 0.65,
  };
}
export function hullPoints(spine, radii) {
  return [
    ...spine.map((q, i) => ({ x: q.x - radii[i], y: q.y })),
    ...spine.map((q, i) => ({ x: q.x + radii[i], y: q.y })).reverse(),
  ];
}
export function baseLimbCount(limbSet) {
  return {
    "Low sweep": 2,
    "High sweep": 2,
    Staggered: 3,
    Trailing: 4,
    "Forward reach": 2,
    Crouched: 4,
    Splayed: 3,
    Tucked: 0,
    Offset: 4,
    Raised: 1,
    "Long stride": 4,
    Folded: 2,
  }[limbSet];
}
export function headDimensions(p) {
  const factors = {
    Wedge: [1.05, 0.85],
    Brow: [1.25, 0.8],
    Muzzle: [0.78, 1.15],
    Shield: [1.15, 1.05],
    Narrow: [0.6, 1.45],
    Pendant: [0.75, 1.5],
    Broad: [1.65, 0.72],
    Tilted: [0.85, 1.15],
    Hammer: [1.95, 0.5],
    Scoop: [1.25, 0.8],
    Long: [0.62, 1.7],
    Offset: [1.1, 0.9],
  }[p.head];
  return {
    rx:
      p.headSize *
      p.headWidth *
      factors[0] *
      (0.7 + 0.6 * (p.headProfile ?? 0.5)),
    ry: p.headSize * factors[1] * (1.2 - 0.4 * (p.headProfile ?? 0.5)),
  };
}
export function headHull(head, module) {
  const outlines = {
    Wedge: [
      [-0.7, -0.85],
      [0.7, -0.85],
      [1, 0.1],
      [0.65, 1],
      [-0.65, 1],
      [-1, 0.1],
    ],
    Shield: [
      [-0.85, -0.85],
      [0.85, -0.85],
      [1, 0.3],
      [0.45, 1.1],
      [-0.45, 1.1],
      [-1, 0.3],
    ],
    Muzzle: [
      [-0.8, -0.9],
      [0.8, -0.9],
      [0.9, 0.35],
      [0.5, 1.35],
      [-0.5, 1.35],
      [-0.9, 0.35],
    ],
    Tilted: [
      [-0.9, -0.7],
      [0.55, -1.1],
      [1, -0.2],
      [0.7, 0.9],
      [-0.7, 0.9],
      [-1, 0.1],
    ],
    Hammer: [
      [-1, -0.65],
      [-0.8, -1],
      [0.8, -1],
      [1, -0.65],
      [1, 0.6],
      [0.7, 0.85],
      [-0.7, 0.85],
      [-1, 0.6],
    ],
    Scoop: [
      [-0.9, -0.85],
      [0.9, -0.85],
      [1, 0.2],
      [0.7, 0.9],
      [0, 0.65],
      [-0.7, 0.9],
      [-1, 0.2],
    ],
  };
  const points = outlines[module];
  if (!points) return null;
  const c = Math.cos(head.rotation),
    s = Math.sin(head.rotation);
  return points.map(([u, v]) => ({
    x: head.x + u * head.rx * c - v * head.ry * s,
    y: head.y + u * head.rx * s + v * head.ry * c,
  }));
}
