const { isMobileNumber } = require('../src/services/scraper');

describe('isMobileNumber (Indonesia)', () => {
  test('returns true for 08 prefix', () => {
    expect(isMobileNumber('08123456789')).toBe(true);
  });

  test('returns true for +628 prefix', () => {
    expect(isMobileNumber('+6281234567890')).toBe(true);
  });

  test('returns true for 00628 prefix', () => {
    expect(isMobileNumber('00628123456789')).toBe(true);
  });

  test('returns true for empty or null phone (do not skip phoneless)', () => {
    expect(isMobileNumber('')).toBe(true);
    expect(isMobileNumber(null)).toBe(true);
    expect(isMobileNumber(undefined)).toBe(true);
  });

  test('returns false for Jakarta landline (021 prefix)', () => {
    expect(isMobileNumber('02112345678')).toBe(false);
  });

  test('returns false for international landline', () => {
    expect(isMobileNumber('+12025550100')).toBe(false);
  });

  test('strips spaces and dashes before matching', () => {
    expect(isMobileNumber('+62 812-3456-7890')).toBe(true);
  });
});
