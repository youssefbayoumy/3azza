import { formatDate, t } from '../i18n/core';

const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value?: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isPastOrTodayIsoDate(value: string, now = new Date()): boolean {
  const date = parseIsoDate(value);
  return date !== null && startOfLocalDay(date).getTime() <= startOfLocalDay(now).getTime();
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isSameLocalDay(value?: string | null, now = new Date()): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;

  return startOfLocalDay(date).getTime() === startOfLocalDay(now).getTime();
}

export function daysUntil(value?: string | null, now = new Date()): number | null {
  const date = parseIsoDate(value);
  if (!date) return null;

  return Math.ceil((startOfLocalDay(date).getTime() - startOfLocalDay(now).getTime()) / DAY_MS);
}

export function isExpired(value?: string | null, now = new Date()): boolean {
  const days = daysUntil(value, now);
  return days !== null && days < 0;
}

export function isExpiringSoon(value?: string | null, thresholdDays = 30, now = new Date()): boolean {
  const days = daysUntil(value, now);
  return days !== null && days >= 0 && days <= thresholdDays;
}

export function formatDateLabel(value?: string | null): string {
  const date = parseIsoDate(value);
  if (!date) return t('dates.noExpiry');
  return formatDate(date);
}
