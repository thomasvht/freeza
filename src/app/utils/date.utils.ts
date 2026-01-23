import { EXPIRY_CONSTANTS } from '../constants/app.constants';

/**
 * Normalizes a date to midnight (00:00:00.000)
 * This is useful for date comparisons to avoid timezone issues
 * @param date - The date to normalize
 * @returns A new Date object set to midnight of the given date
 */
export function normalizeToMidnight(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(EXPIRY_CONSTANTS.MIDNIGHT_HOUR, 0, 0, 0);
  return normalized;
}

/**
 * Calculates the number of days between two dates
 * @param startDate - The start date (typically today)
 * @param endDate - The end date (typically expiry date)
 * @returns Number of days between dates (negative if endDate is before startDate)
 */
export function calculateDaysDifference(startDate: Date, endDate: Date): number {
  return Math.floor((endDate.getTime() - startDate.getTime()) / EXPIRY_CONSTANTS.MS_PER_DAY);
}
