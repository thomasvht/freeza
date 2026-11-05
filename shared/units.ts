export type PackUnit = 'g' | 'kg' | 'ml' | 'l';
export type CountedUnit = 'piece' | 'portion' | 'bag' | 'box';
export type Unit = CountedUnit | PackUnit;

export const UNITS: readonly Unit[] = ['piece', 'portion', 'bag', 'box', 'g', 'kg', 'ml', 'l'];
export const PACK_UNITS: readonly PackUnit[] = ['g', 'kg', 'ml', 'l'];

export const UNIT_LABELS: Record<Unit, string> = {
  piece: 'pieces',
  portion: 'portions',
  bag: 'bags',
  box: 'boxes',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
};

export function isCountedUnit(u: Unit): u is CountedUnit {
  return !(PACK_UNITS as readonly Unit[]).includes(u);
}
