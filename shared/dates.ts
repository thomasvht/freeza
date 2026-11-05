/** Calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function parse(d: IsoDate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, day };
}

function format(y: number, m: number, day: number): IsoDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(day)}`;
}

/** Today in the local time zone; never goes through UTC. */
export function todayLocal(now: Date = new Date()): IsoDate {
  return format(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Adds calendar months, clamping the day to the end of the target month. */
export function addMonths(d: IsoDate, months: number): IsoDate {
  const { y, m, day } = parse(d);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return format(ty, tm, Math.min(day, lastDay));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.day) - Date.UTC(a.y, a.m - 1, a.day)) / MS_PER_DAY);
}
