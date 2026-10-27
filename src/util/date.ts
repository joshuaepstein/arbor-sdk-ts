const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * Formats a date as `Y-m-d H:i:s` in local time, matching what the PHP SDK
 * sends (PHP formats in the process's default timezone).
 */
export function formatArborDate(date: Date): string {
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

const ARBOR_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/**
 * Parses an Arbor date string. `Y-m-d` and `Y-m-d H:i:s` are read as local
 * time (like PHP's `new DateTime()`); anything else falls back to `Date` parsing.
 */
export function parseArborDate(value: string): Date {
  const m = ARBOR_DATE.exec(value.trim());
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', s = '0'] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  }
  return new Date(value);
}
