/**
 * Application-wide constants
 */

export const FOOD_FORM_CONSTANTS = {
  /**
   * Minimum quantity allowed for a food item
   */
  MIN_QUANTITY: 0.1,

  /**
   * Default quantity when adding a new item
   */
  DEFAULT_QUANTITY: 1,
};

export const EXPIRY_CONSTANTS = {
  /**
   * Number of days before expiry to mark item as "expiring soon"
   */
  EXPIRING_SOON_THRESHOLD_DAYS: 7,

  /**
   * Number of hours to reset when normalizing dates to midnight
   */
  MIDNIGHT_HOUR: 0,

  /**
   * Number of milliseconds in a single day
   */
  MS_PER_DAY: 1000 * 60 * 60 * 24,
};
