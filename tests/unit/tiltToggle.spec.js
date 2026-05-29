// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// import.meta.url uses http:// in jsdom environment, so resolve from cwd instead
const SCRIPT = readFileSync(resolve(process.cwd(), 'tilt-toggle.js'), 'utf8');

// Execute tilt-toggle.js and return the wired DOM references.
// We intercept the DOMContentLoaded registration so the callback can be called
// once per setup with fresh DOM elements, without accumulating listeners across
// tests. eval() is safe here: the script is a local project IIFE read from disk,
// equivalent to a browser <script> tag.
function setup({ hasLanding = false } = {}) {
  document.body.className = hasLanding ? 'landing' : '';
  // innerHTML is safe here: the HTML is a hardcoded literal in the test file,
  // not user-supplied or network-sourced data.
  document.body.innerHTML = `
    <div class="toggle" style="display:none" aria-hidden="true">
      <input type="checkbox" id="btn" role="switch" aria-checked="false" />
      <span id="toggleText"></span>
    </div>
    <button id="enterBtn">Enter</button>
  `;

  // Capture the DOMContentLoaded callback before it is registered so we can
  // call it once with the current DOM (and avoid listener accumulation).
  let domLoadedCb = null;
  const origAdd = window.addEventListener.bind(window);
  window.addEventListener = function (event, cb, ...rest) {
    if (event === 'DOMContentLoaded') { domLoadedCb = cb; return; }
    origAdd(event, cb, ...rest);
  };

  // eval() is safe: SCRIPT is read from a local project file at import time,
  // not from user input or the network. It mimics a browser <script> tag.
  // eslint-disable-next-line no-eval
  eval(SCRIPT);

  window.addEventListener = origAdd; // restore before callback runs
  domLoadedCb?.();                   // wire DOM with current elements

  return {
    container: document.querySelector('.toggle'),
    input:     document.getElementById('btn'),
    textEl:    document.getElementById('toggleText'),
    enterBtn:  document.getElementById('enterBtn'),
  };
}

describe('tilt-toggle.js', () => {
  describe('initial aria state', () => {
    it('sets aria-hidden="true" when body has .landing class', () => {
      const { container, textEl } = setup({ hasLanding: true });
      expect(container.getAttribute('aria-hidden')).toBe('true');
      expect(textEl.getAttribute('aria-hidden')).toBe('true');
    });

    it('sets aria-hidden="false" when body lacks .landing class', () => {
      const { container, textEl } = setup({ hasLanding: false });
      expect(container.getAttribute('aria-hidden')).toBe('false');
      expect(textEl.getAttribute('aria-hidden')).toBe('false');
    });
  });

  describe('enter button', () => {
    it('shows the toggle and clears aria-hidden when clicked', () => {
      const { container, enterBtn } = setup();
      enterBtn.click();
      expect(container.style.display).toBe('');
      expect(container.getAttribute('aria-hidden')).toBe('false');
    });
  });

  describe('label', () => {
    it('initialises text to "3D / 2D"', () => {
      const { textEl } = setup();
      expect(textEl.textContent).toBe('3D / 2D');
    });

    it('sets globe title when checkbox is unchecked (3D mode)', () => {
      const { container } = setup();
      expect(container.title).toContain('3D globe active');
    });

    it('sets atlas title when checkbox is checked (2D mode)', () => {
      const { input, container } = setup();
      input.checked = true;
      input.dispatchEvent(new window.Event('change'));
      expect(container.title).toContain('2D atlas active');
    });
  });

  describe('checkbox → view-toggle event', () => {
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
      input.checked = true; // start checked
      let received = null;
      window.addEventListener('view-toggle', ev => { received = ev.detail; }, { once: true });
      input.checked = false;
      input.dispatchEvent(new window.Event('change'));
      expect(received).toEqual({ map: false });
    });
  });

  describe('view-mode-sync event', () => {
    it('sets checkbox.checked and aria-checked from event detail', () => {
      const { input } = setup();
      window.dispatchEvent(new window.CustomEvent('view-mode-sync', { detail: { map: true } }));
      expect(input.checked).toBe(true);
      expect(input.getAttribute('aria-checked')).toBe('true');
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
      document.body.innerHTML = ''; // no toggle elements
      let domLoadedCb = null;
      const origAdd = window.addEventListener.bind(window);
      window.addEventListener = (event, cb, ...rest) => {
        if (event === 'DOMContentLoaded') { domLoadedCb = cb; return; }
        origAdd(event, cb, ...rest);
      };
      // eslint-disable-next-line no-eval
      eval(SCRIPT); // safe: local project file, see top-of-file comment
      window.addEventListener = origAdd;
      expect(() => domLoadedCb?.()).not.toThrow();
    });
  });
});
