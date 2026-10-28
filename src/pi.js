// first 1,000 pi digits (truncated, not rounded)
export const D = 1000;
export const PI_DIGITS =
  "3141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647093844609550582231725359408128481117450284102701938521105559644622948954930381964428810975665933446128475648233786783165271201909145648566923460348610454326648213393607260249141273724587006606315588174881520920962829254091715364367892590360011330530548820466521384146951941511609433057270365759591953092186117381932611793105118548074462379962749567351885752724891227938183011949129833673362440656643086021394946395224737190702179860943702770539217176293176752384674818467669405132000568127145263560827785771342757789609173637178721468440901224953430146549585371050792279689258923542019956112129021960864034418159813629774771309960518707211349999998372978049951059731732816096318595024459455346908302642522308253344685035261931188171010003137838752886587533208381420617177669147303598253490428755468731159562863882353787593751957781857780532171226806613001927876611195909216420198";
export const P_D = BigInt(PI_DIGITS);
const prefixes = new Map();
for (let m = 1; m <= D; m++) {
  const prefix = PI_DIGITS.slice(0, m);
  prefixes.set(prefix, m);
  if (m < D && Number(PI_DIGITS[m]) >= 5)
    prefixes.set((BigInt(prefix) + 1n).toString(), m);
}
export function piLength(seed) {
  return prefixes.get(String(seed)) ?? null;
}
export function piSeed(m) {
  if (!Number.isInteger(m) || m < 1 || m > D)
    throw new RangeError("Pi position must be an integer from 1 to 1000.");
  return PI_DIGITS.slice(0, m);
}
export function piProgress(m) {
  if (m === D) return 1;
  const k = m - 1,
    K = D - 1;
  return (
    0.55 * (1 - Math.exp(-k / 8)) +
    (0.35 * Math.log1p(k / 4)) / Math.log1p(K / 4) +
    0.1 * (1 - (1 - k / K) ** 3)
  );
}
export const OVER_LIMIT =
  "This machine can't hold a number this large. There are more of them out there, more than it has room to count. This one stops here.";
export class SeedLimitError extends RangeError {
  constructor() {
    super(OVER_LIMIT);
    this.name = "SeedLimitError";
  }
}
export function normalizeSeed(input, generatorVersion = 2) {
  if (![1, 2].includes(Number(generatorVersion)))
    throw new TypeError("Unknown generator version.");
  if (typeof input === "number" && !Number.isSafeInteger(input))
    throw new TypeError("Pass large seeds as strings to preserve every digit.");
  let text = String(input ?? "").replace(/\s/g, "");
  if (Number(generatorVersion) === 2) {
    if (["π", "circle", "singularity"].includes(text.toLowerCase()))
      text = PI_DIGITS;
    if (text.startsWith("3.")) text = "3" + text.slice(2);
  }
  if (!/^\d+$/.test(text))
    throw new TypeError("Use a whole, non-negative decimal seed.");
  text = text.replace(/^0+(?=\d)/, "");
  if (text.length > D || (text.length === D && text > PI_DIGITS))
    throw new SeedLimitError();
  if (Number(generatorVersion) === 1 && BigInt(text) > 4294967296n)
    throw new RangeError(
      "The original generator accepts seeds through 4294967296.",
    );
  return Number(generatorVersion) === 2 && piLength(text)
    ? piSeed(piLength(text))
    : text;
}
