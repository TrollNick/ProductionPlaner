import assert from 'node:assert/strict';
import test from 'node:test';
import { addBusinessDays, calculateForecast, countBusinessDays } from './forecast.js';

const delivery = {
  id: 1,
  type: 'delivery' as const,
  start_date: '2026-07-13',
  end_date: '2026-07-17',
  status: 'open' as const,
  dependency_ids: [],
  schedule_mode: 'auto' as const,
  extension_days: 0,
  actual_end_date: '',
  pull_forward: 0,
};

test('rechnet ausschließlich Montag bis Freitag', () => {
  assert.equal(countBusinessDays('2026-07-13', '2026-07-17'), 5);
  assert.equal(addBusinessDays('2026-07-17', 1), '2026-07-20');
  assert.equal(addBusinessDays('2026-07-17', 5), '2026-07-24');
});

test('reiht automatische Arbeit nach einer Abhängigkeit ein', () => {
  const work = {
    id: 2,
    type: 'work' as const,
    start_date: '2026-07-17',
    end_date: '2026-07-23',
    status: 'open' as const,
    dependency_ids: [1],
    schedule_mode: 'auto' as const,
    extension_days: 3,
    actual_end_date: '',
    pull_forward: 0,
  };
  const forecast = calculateForecast([delivery, work]).itemForecasts[2];
  assert.deepEqual({ start: forecast.start, baseEnd: forecast.base_end, end: forecast.end, conflict: forecast.conflict }, {
    start: '2026-07-20',
    baseEnd: '2026-07-24',
    end: '2026-07-29',
    conflict: false,
  });
});

test('warnt bei bewusst festgehaltenem unmöglichem Termin', () => {
  const work = {
    id: 2,
    type: 'work' as const,
    start_date: '2026-07-13',
    end_date: '2026-07-17',
    status: 'open' as const,
    dependency_ids: [1],
    schedule_mode: 'fixed' as const,
    extension_days: 0,
    actual_end_date: '',
    pull_forward: 0,
  };
  const result = calculateForecast([delivery, work]);
  assert.equal(result.itemForecasts[2].conflict, true);
  assert.equal(result.itemForecasts[2].required_start, '2026-07-20');
  assert.deepEqual(result.conflicts, [2]);
});

test('zieht Folgearbeit nur auf Wunsch nach einer frühen Fertigstellung vor', () => {
  const finishedEarly = { ...delivery, status: 'done' as const, actual_end_date: '2026-07-15' };
  const plannedWork = {
    id: 2,
    type: 'work' as const,
    start_date: '2026-07-20',
    end_date: '2026-07-24',
    status: 'open' as const,
    dependency_ids: [1],
    schedule_mode: 'auto' as const,
    extension_days: 0,
    actual_end_date: '',
    pull_forward: 0,
  };
  const withBuffer = calculateForecast([finishedEarly, plannedWork]).itemForecasts[2];
  const pulledForward = calculateForecast([finishedEarly, { ...plannedWork, pull_forward: 1 }]).itemForecasts[2];
  assert.equal(withBuffer.start, '2026-07-20');
  assert.equal(pulledForward.start, '2026-07-16');
  assert.equal(pulledForward.pulled_forward, true);
});
