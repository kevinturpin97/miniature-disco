import { describe, it, expect } from 'vitest';
import { passwordStrength } from '@core/utils/passwordStrength';

describe('passwordStrength', () => {
  it('returns weak for short passwords', () => {
    const result = passwordStrength('abc');
    expect(result.strength).toBe('weak');
    expect(result.score).toBeLessThan(2);
  });

  it('returns fair for medium passwords', () => {
    const result = passwordStrength('abcdef12');
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.score).toBeLessThan(4);
  });

  it('returns strong for complex passwords', () => {
    const result = passwordStrength('Abc123!@#xyz');
    expect(result.strength).toBe('strong');
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it('gives feedback for missing uppercase', () => {
    const result = passwordStrength('abcdef123');
    expect(result.feedback).toContain('Add uppercase letters');
  });

  it('gives feedback for missing numbers', () => {
    const result = passwordStrength('AbcdefGHI');
    expect(result.feedback).toContain('Add numbers');
  });

  it('returns percentage between 0 and 100', () => {
    const result = passwordStrength('Test123!');
    expect(result.percentage).toBeGreaterThanOrEqual(0);
    expect(result.percentage).toBeLessThanOrEqual(100);
  });

  it('includes color for each strength level', () => {
    const weak = passwordStrength('abc');
    const strong = passwordStrength('Abc123!@#xyz');
    expect(weak.color).toBe('#FF4757');
    expect(strong.color).toBe('#39FF14');
  });
});
