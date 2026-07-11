import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStatusTransition, berlinToday } from './item-status.js';

const openItem = {
  status: 'active' as const,
  previous_status: 'open' as const,
  end_date: '2026-07-24',
  baseline_end_date: '2026-07-17',
  actual_end_date: '',
  previous_end_date: '',
};

test('setzt beim Erledigen Ist- und Enddatum auf heute und merkt die aktuelle Deadline', () => {
  const result = applyStatusTransition(openItem, { status: 'done' }, '2026-07-11');
  assert.equal(result.end_date, '2026-07-11');
  assert.equal(result.actual_end_date, '2026-07-11');
  assert.equal(result.previous_end_date, '2026-07-24');
  assert.equal(result.previous_status, 'active');
});

test('stellt beim Rückgängigmachen Status und letzte Deadline wieder her', () => {
  const done = applyStatusTransition(openItem, { status: 'done' }, '2026-07-11');
  const result = applyStatusTransition(done, { status: done.previous_status }, '2026-07-12');
  assert.equal(result.status, 'active');
  assert.equal(result.end_date, '2026-07-24');
  assert.equal(result.actual_end_date, '');
  assert.equal(result.previous_end_date, '');
});

test('respektiert ein ausdrücklich gesetztes tatsächliches Enddatum', () => {
  const result = applyStatusTransition(openItem, { status: 'done', actual_end_date: '2026-07-09' }, '2026-07-11');
  assert.equal(result.end_date, '2026-07-09');
  assert.equal(result.actual_end_date, '2026-07-09');
});

test('ermittelt das Tagesdatum in der Zeitzone Europe/Berlin', () => {
  assert.equal(berlinToday(new Date('2026-07-10T22:30:00.000Z')), '2026-07-11');
});
