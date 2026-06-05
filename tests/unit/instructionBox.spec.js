// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

// instructionBox.js captures DOM elements at module level — set up DOM first.
let initInstructionBox, updateInstruction;

// innerHTML is safe: hardcoded literal fixture, not user-supplied.
beforeAll(async () => {
  document.body.innerHTML = `
    <div id="instructionBox"></div>
    <button id="menuBtn"></button>
  `;
  vi.stubGlobal('reportError', () => {});
  ({ initInstructionBox, updateInstruction } = await import('../../src/ui/instructionBox.js'));
});

import { vi } from 'vitest';

describe('initInstructionBox', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('does not add is-collapsed when localStorage key is absent (default open)', () => {
    initInstructionBox();
    expect(document.getElementById('instructionBox').classList.contains('is-collapsed')).toBe(false);
  });

  it('adds is-collapsed when localStorage key is "0"', () => {
    localStorage.setItem('gci-instr-open', '0');
    initInstructionBox();
    expect(document.getElementById('instructionBox').classList.contains('is-collapsed')).toBe(true);
  });
});

describe('updateInstruction', () => {
  beforeEach(() => {
    document.getElementById('instructionBox').className = '';
  });

  it('adds map-mode class and sets map title for "map" mode', () => {
    updateInstruction('map');
    const box = document.getElementById('instructionBox');
    expect(box.classList.contains('map-mode')).toBe(true);
    expect(box.innerHTML).toContain('Cricket Atlas');
  });

  it('removes globe-mode when switching to map', () => {
    document.getElementById('instructionBox').classList.add('globe-mode');
    updateInstruction('map');
    expect(document.getElementById('instructionBox').classList.contains('globe-mode')).toBe(false);
  });

  it('adds globe-mode class and sets globe title for non-map mode', () => {
    updateInstruction('globe');
    const box = document.getElementById('instructionBox');
    expect(box.classList.contains('globe-mode')).toBe(true);
    expect(box.innerHTML).toContain('Cricket Globe');
  });

  it('removes map-mode when switching to globe', () => {
    document.getElementById('instructionBox').classList.add('map-mode');
    updateInstruction('globe');
    expect(document.getElementById('instructionBox').classList.contains('map-mode')).toBe(false);
  });

  it('wires a close button that collapses the box', () => {
    updateInstruction('globe');
    document.querySelector('.instructions__close').click();
    expect(document.getElementById('instructionBox').classList.contains('is-collapsed')).toBe(true);
  });

  it('clicking the tab re-opens the box', () => {
    localStorage.setItem('gci-instr-open', '0');
    initInstructionBox();
    document.getElementById('instructionsTab').click();
    expect(document.getElementById('instructionBox').classList.contains('is-collapsed')).toBe(false);
  });

  it('clicking the leaderboard row triggers menuBtn click', () => {
    const clicks = [];
    document.getElementById('menuBtn').addEventListener('click', () => clicks.push(1));
    updateInstruction('globe');
    document.querySelector('.ins-tb-row--btn').click();
    expect(clicks).toHaveLength(1);
  });
});
