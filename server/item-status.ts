export type StatusItem = Record<string, unknown> & {
  status: 'open' | 'active' | 'done';
  previous_status?: 'open' | 'active';
  end_date: string;
  baseline_end_date?: string;
  actual_end_date?: string;
  previous_end_date?: string;
};

export function berlinToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function applyStatusTransition(current: StatusItem, changes: Record<string, unknown>, today = berlinToday()) {
  const next = { ...current, ...changes } as StatusItem;

  if (current.status !== 'done' && next.status === 'done') {
    const actualEnd = typeof changes.actual_end_date === 'string' && changes.actual_end_date ? changes.actual_end_date : today;
    next.previous_status = current.status;
    next.previous_end_date = current.end_date;
    next.end_date = actualEnd;
    next.actual_end_date = actualEnd;
  } else if (current.status === 'done' && next.status !== 'done') {
    next.end_date = current.previous_end_date || current.baseline_end_date || current.end_date;
    next.actual_end_date = '';
    next.previous_end_date = '';
  } else if (next.status === 'done') {
    const actualEnd = typeof changes.actual_end_date === 'string' && changes.actual_end_date
      ? changes.actual_end_date
      : typeof changes.end_date === 'string' && changes.end_date
        ? changes.end_date
        : current.actual_end_date || current.end_date;
    next.end_date = actualEnd;
    next.actual_end_date = actualEnd;
  }

  return next;
}
