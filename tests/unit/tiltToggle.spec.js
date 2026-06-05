// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { initTiltToggle } from '../../src/ui/tiltToggle.js';

// innerHTML is safe here: hardcoded literal in test file, not user-supplied.
function setup() {
  document.body.className = '';
  document.body.innerHTML = `
    <div class="view-toggle-wrap" id="viewPill">
      <span class="view-toggle-label view-toggle-3d">3D</span>
      <div class="cricket-toggle">
        <input class="cricket-toggle-input" type="checkbox" id="viewToggleBtn" role="switch" aria-checked="false">
        <label class="cricket-track" for="viewToggleBtn">
          <span class="cricket-ball"></span>
        </label>
      </div>
      <span class="view-toggle-label view-toggle-2d">2D</span>
    </div>
  `;
  initTiltToggle();
  return {
    wrap:  document.getElementById('viewPill'),
    input: document.getElementById('viewToggleBtn'),
  };
}

describe('tiltToggle.js', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.body.className = ''; });

  describe('initial state', () => {
    it('checkbox is unchecked on init (3D mode)', () => {
      const { input } = setup();
      expect(input.checked).toBe(false);
    });

    it('aria-checked is false on init', () => {
      const { input } = setup();
      expect(input.getAttribute('aria-checked')).toBe('false');
    });

    it('wrap title contains "3D globe active" on init', () => {
      const { wrap } = setup();
      expect(wrap.title).toContain('3D globe active');
    });
  });

  describe('checkbox change → view-toggle event', () => {
    it('dispatches view-toggle with map:true when checked', () => {
      const { input } = setup();
      let received = null;
      window.addEventListener('view-toggle', ev => { received = ev.detail; }, { once: true });
      input.checked = true;
      input.dispatchEvent(new window.Event('change'));
      expect(received).toEqual({ map: true });
    });

    it('dispatches view-toggle with map:false when unchecked', () => {
      const { input } = setup();
      input.checked = true;
      let received = null;
      window.addEventListener('view-toggle', ev => { received = ev.detail; }, { once: true });
      input.checked = false;
      input.dispatchEvent(new window.Event('change'));
      expect(received).toEqual({ map: false });
    });

    it('updates aria-checked to true when checked', () => {
      const { input } = setup();
      input.checked = true;
      input.dispatchEvent(new window.Event('change'));
      expect(input.getAttribute('aria-checked')).toBe('true');
    });

    it('updates title to atlas when switched to 2D', () => {
      const { input, wrap } = setup();
      input.checked = true;
      input.dispatchEvent(new window.Event('change'));
      expect(wrap.title).toContain('2D atlas active');
    });
  });

  describe('view-mode-sync event', () => {
    it('checks the input when detail.map is true', () => {
      const { input } = setup();
      window.dispatchEvent(new window.CustomEvent('view-mode-sync', { detail: { map: true } }));
      expect(input.checked).toBe(true);
      expect(input.getAttribute('aria-checked')).toBe('true');
    });

    it('unchecks the input when detail.map is false', () => {
      const { input } = setup();
      window.dispatchEvent(new window.CustomEvent('view-mode-sync', { detail: { map: true } }));
      window.dispatchEvent(new window.CustomEvent('view-mode-sync', { detail: { map: false } }));
      expect(input.checked).toBe(false);
      expect(input.getAttribute('aria-checked')).toBe('false');
    });

    it('handles missing detail gracefully', () => {
      const { input } = setup();
      expect(() => {
        window.dispatchEvent(new window.CustomEvent('view-mode-sync', { detail: null }));
      }).not.toThrow();
      expect(input.checked).toBe(false);
    });
  });

  describe('missing DOM elements', () => {
    it('returns early without throwing when elements are absent', () => {
      document.body.innerHTML = '';
      expect(() => initTiltToggle()).not.toThrow();
    });
  });
});
