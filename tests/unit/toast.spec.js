// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// toast.js captures document.getElementById('loadingToast') at module level,
// so the element must exist before the module is first imported.
describe('toast.js', () => {
  let toast, toastHide, showVenueLoading, hideVenueLoading;

  beforeAll(async () => {
    // innerHTML is safe: hardcoded literal fixture, not user-supplied.
    document.body.innerHTML = '<div id="loadingToast"></div>';
    ({ toast, toastHide, showVenueLoading, hideVenueLoading } =
      await import('../../src/ui/toast.js'));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    hideVenueLoading();
    const el = document.getElementById('loadingToast');
    if (el) { el.classList.remove('show'); el.textContent = ''; }
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  describe('toast / toastHide', () => {
    it('toast sets text and adds show class', () => {
      toast('Loading data…');
      const el = document.getElementById('loadingToast');
      expect(el.textContent).toBe('Loading data…');
      expect(el.classList.contains('show')).toBe(true);
    });

    it('toastHide removes show class', () => {
      toast('Loading data…');
      toastHide();
      expect(document.getElementById('loadingToast').classList.contains('show')).toBe(false);
    });
  });

  describe('showVenueLoading / hideVenueLoading', () => {
    it('creates and shows the loading dialog', () => {
      showVenueLoading('Opening venue…');
      const dialog = document.getElementById('venue-loading-dialog');
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector('div').textContent).toBe('Opening venue…');
    });

    it('uses default message when none is supplied', () => {
      showVenueLoading();
      const dialog = document.getElementById('venue-loading-dialog');
      expect(dialog.querySelector('div').textContent).toBe('Loading venue details...');
    });

    it('re-shows and updates text when dialog already exists', () => {
      showVenueLoading('First');
      hideVenueLoading();
      showVenueLoading('Second');
      const dialog = document.getElementById('venue-loading-dialog');
      expect(dialog.style.display).toBe('flex');
      expect(dialog.querySelector('div').textContent).toBe('Second');
    });

    it('hideVenueLoading sets display to none', () => {
      showVenueLoading();
      hideVenueLoading();
      expect(document.getElementById('venue-loading-dialog').style.display).toBe('none');
    });

    it('clears the prior timeout and listener when re-shown without hiding first', () => {
      showVenueLoading('A');         // sets _state.timeoutId + onOpen
      showVenueLoading('B');         // both already set → clear-then-reset branches fire
      const dialog = document.getElementById('venue-loading-dialog');
      expect(dialog.style.display).toBe('flex');
      expect(dialog.querySelector('div').textContent).toBe('B');
    });

    it('auto-hides when venuewindow:open fires', () => {
      showVenueLoading('Auto-hide test');
      window.dispatchEvent(new CustomEvent('venuewindow:open'));
      expect(document.getElementById('venue-loading-dialog').style.display).toBe('none');
    });

    it('auto-hides after the 10 s safety timeout', () => {
      showVenueLoading();
      vi.advanceTimersByTime(10000);
      expect(document.getElementById('venue-loading-dialog').style.display).toBe('none');
    });
  });
});
