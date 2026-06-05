// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initThemeToggle } from '../../src/ui/themeToggle.js';

// innerHTML is safe: hardcoded literal fixture, not user-supplied.
function setup() {
  document.body.innerHTML = '<button id="themeToggleBtn"></button>';
  return document.getElementById('themeToggleBtn');
}

describe('initThemeToggle', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('applies dark theme by default when nothing is saved', () => {
    setup();
    initThemeToggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('applies saved light theme from localStorage', () => {
    localStorage.setItem('gci-theme', 'light');
    setup();
    initThemeToggle();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('sets aria-label to "Switch to dark theme" when light is active', () => {
    localStorage.setItem('gci-theme', 'light');
    const btn = setup();
    initThemeToggle();
    expect(btn.getAttribute('aria-label')).toBe('Switch to dark theme');
  });

  it('sets aria-label to "Switch to light theme" when dark is active', () => {
    const btn = setup();
    initThemeToggle();
    expect(btn.getAttribute('aria-label')).toBe('Switch to light theme');
  });

  it('toggles from dark to light on click', () => {
    const btn = setup();
    initThemeToggle();
    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('gci-theme')).toBe('light');
  });

  it('toggles from light back to dark on click', () => {
    localStorage.setItem('gci-theme', 'light');
    const btn = setup();
    initThemeToggle();
    btn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('does not throw when the button element is absent', () => {
    document.body.innerHTML = '';
    expect(() => initThemeToggle()).not.toThrow();
  });
});
