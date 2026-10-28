// machin's formula (16*atan(1/5) - 4*atan(1/239)) with guard digits
export function machinDigits(count = 1000) {
  const scale = 10n ** BigInt(count + 24);
  const atan = (q) => {
    let term = scale / q,
      sum = term,
      n = 1n;
    while (term) {
      term /= q * q;
      if (!term) break;
      const v = term / (2n * n + 1n);
      sum += n % 2n ? -v : v;
      n++;
    }
    return sum;
  };
  return (16n * atan(5n) - 4n * atan(239n)).toString().slice(0, count);
}
