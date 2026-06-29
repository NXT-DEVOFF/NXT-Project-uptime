import { describe, it, expect, vi } from 'vitest';
import { formatDate, isFutureDate } from './dateUtils';

describe('Date Utilities', () => {
  describe('formatDate', () => {
    it('should format a date correctly', () => {
      const result = formatDate('2023-06-15');
      // Result depends on locale, but should contain the date parts
      expect(result).toContain('2023');
      expect(result).toContain('Jun');
      expect(result).toContain('15');
    });

    it('should handle invalid dates gracefully', () => {
      const result = formatDate('invalid-date');
      // Invalid date should return "Invalid Date" or similar
      expect(result).toBe('Invalid Date');
    });
  });

  describe('isFutureDate', () => {
    it('should return true for future dates', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // 10 days in future
      expect(isFutureDate(futureDate.toISOString())).toBe(true);
    });

    it('should return false for past dates', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10); // 10 days in past
      expect(isFutureDate(pastDate.toISOString())).toBe(false);
    });

    it('should return false for today', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(isFutureDate(today.toISOString())).toBe(false);
    });
  });
});