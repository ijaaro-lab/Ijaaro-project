/**
 * Pure calendar helpers mirroring generate_monthly_rent_charges SQL.
 * Date-only (YYYY-MM-DD); no timezone conversion.
 */

export type PeriodPlan = {
  period_start: string;
  period_end: string;
  due_date: string;
};

function parseDateOnly(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`invalid date-only value: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toDateOnly(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Last calendar day of month (handles Feb / leap years). */
export function monthEnd(y: number, m: number): string {
  // Day 0 of next month = last day of m
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return toDateOnly(y, m, last);
}

export function monthStart(y: number, m: number): string {
  return toDateOnly(y, m, 1);
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** due_day constrained 1–28 (matches rental_assignments check). */
export function rentDueDate(y: number, m: number, dueDay: number | null | undefined): string {
  const day = Math.min(Math.max(dueDay ?? 1, 1), 28);
  return toDateOnly(y, m, day);
}

export function compareDateOnly(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Plan missing charges for one assignment up to as_of month (inclusive).
 * Mirrors SQL generate_monthly_rent_charges catch-up rules.
 */
export function planMonthlyRentCharges(input: {
  start_date: string;
  end_date?: string | null;
  due_day?: number | null;
  last_period_end?: string | null;
  as_of: string;
  max_months?: number;
}): PeriodPlan[] {
  const maxMonths = input.max_months ?? 3;
  if (maxMonths < 1 || maxMonths > 24) throw new Error("max_months must be between 1 and 24");

  const asOf = parseDateOnly(input.as_of);
  const monthCap = monthStart(asOf.y, asOf.m);
  const start = parseDateOnly(input.start_date);
  const startMonth = monthStart(start.y, start.m);

  if (compareDateOnly(input.start_date, input.as_of) > 0) return [];

  let cursor: string;
  if (!input.last_period_end) {
    if (compareDateOnly(startMonth, monthCap) > 0) return [];
    cursor = compareDateOnly(startMonth, monthCap) === 0 ? startMonth : monthCap;
  } else {
    const last = parseDateOnly(input.last_period_end);
    const next = addMonths(last.y, last.m, 1);
    cursor = monthStart(next.y, next.m);
  }

  const dueDay =
    input.due_day != null
      ? Math.min(Math.max(input.due_day, 1), 28)
      : Math.min(start.d, 28);

  const out: PeriodPlan[] = [];
  while (compareDateOnly(cursor, monthCap) <= 0 && out.length < maxMonths) {
    const c = parseDateOnly(cursor);
    if (input.end_date && compareDateOnly(cursor, input.end_date) > 0) break;

    const period_end = monthEnd(c.y, c.m);
    const period_start =
      compareDateOnly(cursor, startMonth) === 0 ? input.start_date : cursor;

    if (compareDateOnly(period_end, period_start) < 0) {
      throw new Error("invalid period");
    }
    if (input.end_date && compareDateOnly(period_start, input.end_date) > 0) break;
    if (compareDateOnly(period_end, input.start_date) < 0) {
      const n = addMonths(c.y, c.m, 1);
      cursor = monthStart(n.y, n.m);
      continue;
    }

    let due_date = rentDueDate(c.y, c.m, dueDay);
    // Match assign_renter: roll forward when due day is before period start.
    if (compareDateOnly(due_date, period_start) < 0) {
      const rolled = addMonths(c.y, c.m, 1);
      due_date = rentDueDate(rolled.y, rolled.m, dueDay);
    }

    out.push({
      period_start,
      period_end,
      due_date,
    });

    const n = addMonths(c.y, c.m, 1);
    cursor = monthStart(n.y, n.m);
  }

  return out;
}
