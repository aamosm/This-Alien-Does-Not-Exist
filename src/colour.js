// oklab color model to srgb; binary search fits chroma to gamut
export function oklchRGB(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180),
    b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  if (rgb.some((x) => x < 0 || x > 1) && C > 0.0001) {
    let lo = 0,
      hi = C;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const rr = raw(L, mid, h);
      if (rr.some((x) => x < 0 || x > 1)) hi = mid;
      else lo = mid;
    }
    return raw(L, lo, h).map(srgb);
  }
  return rgb.map(srgb);
}
function srgb(v) {
  return (
    255 *
    (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055)
  );
}
function raw(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180),
    b = C * Math.sin((h * Math.PI) / 180),
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
export const rgbCSS = (rgb) =>
  `rgb(${rgb.map((x) => Math.round(Math.max(0, Math.min(255, x)))).join(" ")})`;
