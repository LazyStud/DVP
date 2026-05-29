import { describe, it, expect } from 'vitest';
import {
  YEAR_MIN,
  YEAR_MAX,
  PALETTES,
  DB_URL,
  ICON_PATH,
  SPIN_DEG_PER_SEC,
  ICON_BASE,
  FLOW_MAP_COLOR,
} from '../../src/config.js';

describe('config constants', () => {
  it('YEAR_MIN is a number ≥ 1900', () => {
    expect(typeof YEAR_MIN).toBe('number');
    expect(YEAR_MIN).toBeGreaterThanOrEqual(1900);
  });

  it('YEAR_MAX is a number > YEAR_MIN', () => {
    expect(typeof YEAR_MAX).toBe('number');
    expect(YEAR_MAX).toBeGreaterThan(YEAR_MIN);
  });

  it('YEAR range covers at least 20 years', () => {
    expect(YEAR_MAX - YEAR_MIN).toBeGreaterThanOrEqual(20);
  });

  it('PALETTES has entries for all, odi, t20, test', () => {
    for (const key of ['all', 'odi', 't20', 'test']) {
      expect(PALETTES).toHaveProperty(key);
    }
  });

  it('each PALETTE entry has exactly 3 colour stops', () => {
    for (const [key, stops] of Object.entries(PALETTES)) {
      expect(Array.isArray(stops), `${key} should be an array`).toBe(true);
      expect(stops.length, `${key} should have 3 stops`).toBe(3);
    }
  });

  it('all PALETTE stops look like CSS colours', () => {
    const cssColor = /^#[0-9a-fA-F]{3,8}$|^rgb/;
    for (const stops of Object.values(PALETTES)) {
      for (const stop of stops) {
        expect(cssColor.test(stop), `"${stop}" should look like a CSS colour`).toBe(true);
      }
    }
  });

  it('DB_URL is a non-empty string', () => {
    expect(typeof DB_URL).toBe('string');
    expect(DB_URL.length).toBeGreaterThan(0);
  });

  it('DB_URL points to a .db file', () => {
    expect(DB_URL).toMatch(/\.db$/);
  });

  it('ICON_PATH is a non-empty string', () => {
    expect(typeof ICON_PATH).toBe('string');
    expect(ICON_PATH.length).toBeGreaterThan(0);
  });

  it('SPIN_DEG_PER_SEC is a positive number', () => {
    expect(typeof SPIN_DEG_PER_SEC).toBe('number');
    expect(SPIN_DEG_PER_SEC).toBeGreaterThan(0);
  });

  it('ICON_BASE is a positive number', () => {
    expect(typeof ICON_BASE).toBe('number');
    expect(ICON_BASE).toBeGreaterThan(0);
  });

  it('FLOW_MAP_COLOR is a CSS hex colour', () => {
    expect(FLOW_MAP_COLOR).toMatch(/^#[0-9a-fA-F]{3,6}$/);
  });
});
