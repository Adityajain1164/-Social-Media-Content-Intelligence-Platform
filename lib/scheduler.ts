/**
 * Computes the next run date for a campaign based on its frequency.
 * Anchors the calculation from the provided anchor date to prevent time-drift.
 */
export function getNextRunAt(frequency: string, anchor: Date = new Date()): Date {
  switch (frequency) {
    case 'daily':
      return new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
    case '3x_week':
      return new Date(anchor.getTime() + 56 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(anchor.getTime() + 7 * 24 * 60 * 60 * 1000);
    default:
      return new Date(anchor.getTime() + 24 * 60 * 60 * 1000);
  }
}
