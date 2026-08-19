export interface WarrantyPeriod {
  start: string;
  end: string;
  durationMonths: number;
}

export function toIsoDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${toIsoDate(isoDate)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDayOfMonth = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(day, lastDayOfMonth));
  return toIsoDate(date);
}

export function calculateWarrantyPeriod(
  startDate: string,
  durationMonths: number,
): WarrantyPeriod {
  const start = toIsoDate(startDate);
  return {
    start,
    end: addMonths(start, durationMonths),
    durationMonths,
  };
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${toIsoDate(from)}T00:00:00`).getTime();
  const b = new Date(`${toIsoDate(to)}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function isExpired(endDate: string, reference: Date = new Date()): boolean {
  if (!endDate) return false;
  return daysBetween(toIsoDate(reference), endDate) < 0;
}
