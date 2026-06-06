// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initHostNationPulse } from '../../src/ui/hostNationPulse.js';

describe('initHostNationPulse', () => {
  it('sets --vp-delay on each .country.has-venues element', () => {
    document.body.innerHTML = `
      <div class="country has-venues" id="a"></div>
      <div class="country has-venues" id="b"></div>
      <div class="country" id="c"></div>
    `;
    initHostNationPulse();
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    const c = document.getElementById('c');
    expect(a.style.getPropertyValue('--vp-delay')).toMatch(/^\d+\.\d+s$/);
    expect(b.style.getPropertyValue('--vp-delay')).toMatch(/^\d+\.\d+s$/);
    expect(c.style.getPropertyValue('--vp-delay')).toBe('');
  });

  it('does not throw when no .country.has-venues elements exist', () => {
    document.body.innerHTML = '<div class="country"></div>';
    expect(() => initHostNationPulse()).not.toThrow();
  });

  it('delay value is within the CSS cycle range', () => {
    document.body.innerHTML = '<div class="country has-venues" id="d"></div>';
    initHostNationPulse();
    const raw = document.getElementById('d').style.getPropertyValue('--vp-delay');
    const seconds = parseFloat(raw);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThan(2.8);
  });
});
