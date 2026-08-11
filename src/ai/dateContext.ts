const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

function addDays(date: Date, days: number): Date {
  const result = cloneDate(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

function nextWeekday(date: Date, weekday: number): Date {
  // The next-week Sunday is two Sundays away because the week starts on Sunday.
  return addDays(startOfWeek(date), weekday === 0 ? 14 : 7 + weekday);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** Build the date facts and relative-date rules used by every AI prompt. */
export function buildDateContext(now: Date = new Date()): string {
  const today = formatDate(now);
  const tomorrow = formatDate(addDays(now, 1));
  const dayAfterTomorrow = formatDate(addDays(now, 2));
  const nextMonday = formatDate(nextWeekday(now, 1));
  const nextWednesday = formatDate(nextWeekday(now, 3));
  const nextSunday = formatDate(nextWeekday(now, 0));
  const weekStart = startOfWeek(now);
  const thisSaturday = formatDate(addDays(weekStart, 6));
  const thisSunday = formatDate(addDays(weekStart, 7));
  const monthEnd = formatDate(endOfMonth(now));

  return `## Current Date Context
Today: ${today} (${WEEKDAY_NAMES[now.getDay()]})
Tomorrow: ${tomorrow}
Next Monday: ${nextMonday}
Next Sunday: ${nextSunday}
End of month: ${monthEnd}

## Relative Date Resolution Rules
- "明天" -> ${tomorrow}
- "后天" -> ${dayAfterTomorrow}
- "下周一" -> ${nextMonday}
- "下周三" -> ${nextWednesday}
- "下周日" -> ${nextSunday}
- "本周末" -> ${thisSaturday} (Saturday) or ${thisSunday} (Sunday)
- "N 天后" -> today + N days; calculate the resulting YYYY-MM-DD
- "月底" -> ${monthEnd}
- "下周" without a weekday is ambiguous; ask the user to clarify.

IMPORTANT: Resolve relative dates YOURSELF before calling tools that require YYYY-MM-DD. Never pass raw "下周三", "明天", or "3 天后" to a tool.`;
}
