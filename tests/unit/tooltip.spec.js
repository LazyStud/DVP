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

  it('returns a valid SVG string for a single point', () => {
    const svg = sparklineSvg([{ year: 2015, count: 10 }]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="60"');
    expect(svg).toContain('height="24"');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<circle');
    expect(svg).toContain('</svg>');
  });

  it('returns polyline with multiple points', () => {
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
    const svg = sparklineSvg([{ year: 2010, count: 5 }], 120, 40, '#ff0000');
    expect(svg).toContain('width="120"');
    expect(svg).toContain('height="40"');
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toContain('fill="#ff0000"');
  });

  it('handles single-year range (xMin === xMax)', () => {
    const svg = sparklineSvg([
      { year: 2015, count: 3 },
      { year: 2015, count: 7 },
    ]);
    expect(svg).toContain('<polyline');
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