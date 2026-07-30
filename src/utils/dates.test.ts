import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, formatDateLabel, isExpired, isExpiringSoon, isPastOrTodayIsoDate, isSameLocalDay, parseIsoDate, toIsoDate } from './dates';

describe('date utilities', () => {
  it('parses and formats ISO dates safely', () => {
    assert.equal(toIsoDate(new Date(2026, 5, 28)), '2026-06-28');
    assert.equal(parseIsoDate('2026-02-30'), null);
    assert.equal(parseIsoDate('not-a-date'), null);
    assert.equal(formatDateLabel(null), 'No expiry');
  });

  it('calculates expiry windows from local dates', () => {
    const now = new Date(2026, 5, 1, 15);

    assert.equal(daysUntil('2026-06-15', now), 14);
    assert.equal(isExpiringSoon('2026-06-15', 30, now), true);
    assert.equal(isExpiringSoon('2026-07-15', 30, now), false);
    assert.equal(isExpired('2026-05-31', now), true);
  });

  it('compares saved timestamps by local calendar day', () => {
    const now = new Date(2026, 5, 28, 22, 0, 0);

    assert.equal(isSameLocalDay(new Date(2026, 5, 28, 7, 0, 0).toISOString(), now), true);
    assert.equal(isSameLocalDay(new Date(2026, 5, 27, 23, 59, 0).toISOString(), now), false);
    assert.equal(isSameLocalDay(null, now), false);
  });

  it('accepts valid service-history dates no later than today', () => {
    const now = new Date(2026, 6, 24, 12);
    assert.equal(isPastOrTodayIsoDate('2026-07-24', now), true);
    assert.equal(isPastOrTodayIsoDate('2026-07-25', now), false);
    assert.equal(isPastOrTodayIsoDate('2026-02-30', now), false);
  });
});
