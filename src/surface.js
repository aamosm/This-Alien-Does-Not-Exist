export function pigment(pattern, u, v, phase, noise) {
  const wave = Math.sin(u * 5 + Math.sin(v * 2) + phase * 6),
    n = noise(u * 2, v * 2),
    clamp = (x) => Math.max(0, Math.min(1, x));
  switch (pattern) {
    case "Plain":
      return 0;
    case "Bands":
      return clamp((wave - 0.2) * 1.8);
    case "Spots":
      return clamp(
        (0.27 - Math.hypot(u - Math.floor(u) - 0.5, v - Math.floor(v) - 0.5)) *
          14,
      );
    case "Reticulate":
      return clamp((0.085 - Math.abs(n - 0.5)) * 12);
    case "Speckles":
      return clamp((noise(u * 6, v * 6) - 0.65) * 4);
    case "Mottled":
      return clamp((n - 0.35) * 2);
    case "Veins":
      return clamp(
        (0.08 - Math.abs(Math.sin(u * 3 + n * 5) * Math.cos(v * 2))) * 15,
      );
    case "Dashes":
      return wave > 0.3 && Math.sin(v * 9) > 0.2 ? 0.8 : 0;
    case "Scales":
      return clamp(
        (0.07 -
          Math.abs(
            Math.hypot((((u % 1) + 1) % 1) - 0.5, (((v % 1) + 1) % 1) - 0.5) -
              0.4,
          )) *
          16,
      );
    case "Rings":
      return clamp((Math.sin(Math.hypot(u, v) * 7 + n * 3) - 0.4) * 2);
    case "Striae":
      return clamp((Math.sin(u * 12 + Math.sin(v) * 3) - 0.55) * 3);
    case "Islands":
      return clamp((n - 0.5) * 8);
    default:
      return 0;
  }
}
