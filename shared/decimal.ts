/** Parses user-typed decimals, accepting a comma or dot separator. Returns null when invalid. */
export function parseDecimal(input: string): number | null {
  const s = input.trim();
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
