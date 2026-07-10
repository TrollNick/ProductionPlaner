export type PlanItem = {
  id: number;
  type: 'delivery' | 'work';
  start_date: string;
  end_date: string;
  status: 'open' | 'active' | 'done';
  dependency_ids: number[];
};

const DAY = 86_400_000;
const parse = (date: string) => new Date(`${date}T12:00:00Z`);
const format = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY);
const duration = (item: PlanItem) => Math.max(0, Math.round((parse(item.end_date).getTime() - parse(item.start_date).getTime()) / DAY));

export function calculateForecast(items: PlanItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const cache = new Map<number, { start: string; end: string }>();
  const visiting = new Set<number>();

  const calculate = (item: PlanItem): { start: string; end: string } => {
    const cached = cache.get(item.id);
    if (cached) return cached;
    if (visiting.has(item.id)) return { start: item.start_date, end: item.end_date };
    visiting.add(item.id);

    let earliestStart = parse(item.start_date);
    for (const dependencyId of item.dependency_ids) {
      const dependency = byId.get(dependencyId);
      if (!dependency) continue;
      const dependencyForecast = calculate(dependency);
      const dayAfterDependency = addDays(parse(dependencyForecast.end), 1);
      if (dayAfterDependency > earliestStart) earliestStart = dayAfterDependency;
    }

    const result = item.type === 'delivery' || item.status === 'done'
      ? { start: item.start_date, end: item.end_date }
      : { start: format(earliestStart), end: format(addDays(earliestStart, duration(item))) };
    visiting.delete(item.id);
    cache.set(item.id, result);
    return result;
  };

  const itemForecasts = Object.fromEntries(items.map((item) => [item.id, calculate(item)]));
  const unfinished = items.filter((item) => item.status !== 'done');
  const completion = unfinished.length
    ? unfinished.reduce((latest, item) => itemForecasts[item.id].end > latest ? itemForecasts[item.id].end : latest, unfinished[0] ? itemForecasts[unfinished[0].id].end : '')
    : items.reduce((latest, item) => item.end_date > latest ? item.end_date : latest, '');

  return { completion, itemForecasts };
}
