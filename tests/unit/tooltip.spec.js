import { describe, it, expect, vi } from 'vitest';

// debug.js uses location.search — must mock before importing anything that depends on it
vi.mock('../../src/debug.js', () => ({ DEBUG: false }));

import { sparklineSvg, escapeHtml } from '../../src/ui/tooltip.js';

// ── sparklineSvg ─────────────────────────────────────────────────────────────

describe('sparklineSvg', () => {
  it('returns empty string for null/empty points', () => {
    expect(sparklineSvg(null)).toBe('');
    expect(sparklineSvg([])).toBe('');
  });

  it('returns a valid SVG string with default dimensions', () => {
    const svg = sparklineSvg([{ year: 2015, count: 10 }]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="120"');
    expect(svg).toContain('height="44"');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<circle');
    expect(svg).toContain('</svg>');
  });

  it('includes y-axis labels (0 and max)', () => {
    const svg = sparklineSvg([{ year: 2010, count: 10 }]);
    expect(svg).toContain('>0<');
    expect(svg).toContain('>10<');
  });

  it('formats large y-max with k suffix', () => {
    const svg = sparklineSvg([{ year: 2010, count: 2500 }]);
    expect(svg).toContain('>2.5k<');
  });

  it('includes x-axis labels (first and last year)', () => {
    const svg = sparklineSvg([
      { year: 2010, count: 5 },
      { year: 2015, count: 15 },
      { year: 2020, count: 8 },
    ]);
    expect(svg).toContain('>2010<');
    expect(svg).toContain('>2020<');
  });

  it('includes baseline line', () => {
    const svg = sparklineSvg([{ year: 2010, count: 5 }]);
    expect(svg).toContain('<line');
  });

  it('returns polyline with multiple points and dots', () => {
    const svg = sparklineSvg([
      { year: 2010, count: 5 },
      { year: 2015, count: 15 },
      { year: 2020, count: 8 },
    ]);
    expect(svg).toContain('<polyline');
    const circles = svg.match(/<circle/g);
    expect(circles).toHaveLength(3);
  });

  it('accepts custom width, height, and stroke', () => {
    const svg = sparklineSvg([{ year: 2010, count: 5 }], 200, 60, '#ff0000');
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="60"');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('fill="#ff0000"');
  });

  it('handles single-year range (xMin === xMax)', () => {
    const svg = sparklineSvg([
      { year: 2015, count: 3 },
      { year: 2015, count: 7 },
    ]);
    expect(svg).toContain('<polyline');
    expect(svg).toContain('>2015<');
  });

  it('handles all-zero counts (yMax capped at 1)', () => {
    const svg = sparklineSvg([{ year: 2010, count: 0 }]);
    expect(svg).toContain('<polyline');
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });

  it('includes xmlns attribute', () => {
    const svg = sparklineSvg([{ year: 2010, count: 1 }]);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});

// ── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes HTML special chars', () => {
    const result = escapeHtml('<script>alert("xss")</script>');
    const lt = String.fromCharCode(60); // avoid formatter rewriting entities
    expect(result).toContain('lt;script');
    expect(result).toContain('lt;/script');
    expect(result).not.toContain(lt + 'script');
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('converts non-string input to string', () => {
    expect(escapeHtml(123)).toBe('123');
  });
});