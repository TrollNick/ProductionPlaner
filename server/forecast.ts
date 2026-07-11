export type PlanItem = {
  id: number;
  type: 'delivery' | 'work';
  start_date: string;
  end_date: string;
  status: 'open' | 'active' | 'done';
  dependency_ids: number[];
  schedule_mode: 'auto' | 'fixed';
  extension_days: number;
  actual_end_date: string;
  pull_forward: number;
};

type ItemForecast = {
  start: string;
  end: string;
  base_end: string;
  required_start: string;
  shifted: boolean;
  conflict: boolean;
  pulled_forward: boolean;
};

const DAY = 86_400_000;
const parse = (date: string) => new Date(`${date}T12:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);
const addCalendarDays = (date: string, days: number) => format(new Date(parse(date).getTime() + days * DAY));

export function isBusinessDay(date: string) {
  const weekday = parse(date).getUTCDay();
  return weekday !== 0 && weekday !== 6;
}

export function nextBusinessDay(date: string, includeCurrent = false) {
  let cursor = includeCurrent ? date : addCalendarDays(date, 1);
  while (!isBusinessDay(cursor)) cursor = addCalendarDays(cursor, 1);
  return cursor;
}

export function addBusinessDays(date: string, days: number) {
  let cursor = isBusinessDay(date) ? date : nextBusinessDay(date, true);
  const direction = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    cursor = addCalendarDays(cursor, direction);
    if (isBusinessDay(cursor)) remaining -= 1;
  }
  return cursor;
}

export function countBusinessDays(start: string, end: string) {
  if (end < start) return 1;
  let cursor = start;
  let count = 0;
  while (cursor <= end) {
    if (isBusinessDay(cursor)) count += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return Math.max(1, count);
}

export function calculateForecast(items: PlanItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const cache = new Map<number, ItemForecast>();
  const visiting = new Set<number>();

  const calculate = (item: PlanItem): ItemForecast => {
    const cached = cache.get(item.id);
    if (cached) return cached;
    if (visiting.has(item.id)) {
      return { start: item.start_date, end: item.end_date, base_end: item.end_date, required_start: item.start_date, shifted: false, conflict: true, pulled_forward: false };
    }
    visiting.add(item.id);

    let dependencyReady = '';
    for (const dependencyId of item.dependency_ids) {
      const dependency = byId.get(dependencyId);
      if (!dependency) continue;
      const candidate = nextBusinessDay(calculate(dependency).end);
      if (candidate > dependencyReady) dependencyReady = candidate;
    }

    const plannedStart = nextBusinessDay(item.start_date, true);
    const requiredStart = dependencyReady || plannedStart;

    let result: ItemForecast;
    if (item.type === 'delivery') {
      const deliveryEnd = item.status === 'done' && item.actual_end_date ? item.actual_end_date : item.end_date;
      result = {
        start: item.start_date,
        end: deliveryEnd,
        base_end: deliveryEnd,
        required_start: requiredStart,
        shifted: deliveryEnd !== item.end_date,
        conflict: false,
        pulled_forward: deliveryEnd < item.end_date,
      };
    } else if (item.status === 'done') {
      const actualEnd = item.actual_end_date || item.end_date;
      result = {
        start: plannedStart,
        end: actualEnd,
        base_end: actualEnd,
        required_start: requiredStart,
        shifted: actualEnd !== item.end_date,
        conflict: false,
        pulled_forward: actualEnd < item.end_date,
      };
    } else {
      const autoStart = dependencyReady
        ? (item.pull_forward ? dependencyReady : (dependencyReady > plannedStart ? dependencyReady : plannedStart))
        : plannedStart;
      const start = item.schedule_mode === 'fixed' ? plannedStart : autoStart;
      const workDays = countBusinessDays(item.start_date, item.end_date);
      const baseEnd = addBusinessDays(start, workDays - 1);
      const end = addBusinessDays(baseEnd, Math.max(0, Number(item.extension_days) || 0));
      result = {
        start,
        end,
        base_end: baseEnd,
        required_start: requiredStart,
        shifted: start !== item.start_date || end !== item.end_date,
        conflict: item.schedule_mode === 'fixed' && requiredStart > start,
        pulled_forward: start < plannedStart,
      };
    }

    visiting.delete(item.id);
    cache.set(item.id, result);
    return result;
  };

  const itemForecasts = Object.fromEntries(items.map((item) => [item.id, calculate(item)]));
  const unfinished = items.filter((item) => item.status !== 'done');
  const relevant = unfinished.length ? unfinished : items;
  const completion = relevant.reduce((latest, item) => itemForecasts[item.id].end > latest ? itemForecasts[item.id].end : latest, '');
  const conflicts = items.filter((item) => itemForecasts[item.id].conflict).map((item) => item.id);

  return { completion, conflicts, itemForecasts };
}
