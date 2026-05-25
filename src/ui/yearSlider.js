/* Dual-thumb year-range slider. */
import { state }              from '../state.js';
import { YEAR_MIN, YEAR_MAX } from '../config.js';

const yearBox      = document.getElementById('yearBox');
const yrSlider     = document.querySelector('.yr-slider');
const yrTrack      = document.querySelector('.yr-track');
const yrFill       = document.querySelector('.yr-fill');
const yrThumbL     = document.querySelector('.yr-thumb.left');
const yrThumbR     = document.querySelector('.yr-thumb.right');
const yrBubbleL    = document.getElementById('yrBubbleLeft');
const yrBubbleR    = document.getElementById('yrBubbleRight');
const yearBoxValue = document.getElementById('yearBoxValue');

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// Module-scope so drag handlers AND external callers (playback) share the same state.
let vL = YEAR_MIN;
let vR = YEAR_MAX;

function render(emit = true) {
  if (!yrTrack || !yrSlider || !yrFill || !yrThumbL || !yrThumbR) return;
  const trackRect  = yrTrack.getBoundingClientRect();
  const sliderRect = yrSlider.getBoundingClientRect();
  const W          = Math.max(1, trackRect.width);
  const trackLeft  = trackRect.left - sliderRect.left;
  const yearToX    = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, W]);

  if (vL > vR) [vL, vR] = [vR, vL];
  vL = clamp(Math.round(vL), YEAR_MIN, YEAR_MAX);
  vR = clamp(Math.round(vR), YEAR_MIN, YEAR_MAX);

  const xL = yearToX(vL), xR = yearToX(vR);
  yrFill.style.left   = `${trackLeft + xL}px`;
  yrFill.style.width  = `${xR - xL}px`;
  yrThumbL.style.left = `${trackLeft + xL}px`;
  yrThumbR.style.left = `${trackLeft + xR}px`;
  yrBubbleL.textContent = Math.round(vL);
  yrBubbleR.textContent = Math.round(vR);
  yearBoxValue.textContent = `Years ${Math.round(vL)}–${Math.round(vR)}`;

  if (emit) {
    state.yearRange = { min: Math.round(vL), max: Math.round(vR) };
    window.dispatchEvent(new CustomEvent('yearrange:change', { detail: state.yearRange }));
  }
}

/**
 * Move thumbs to a new range without dispatching yearrange:change.
 * Used by playback to keep the visual in sync without double-triggering recompute.
 */
export function syncSlider(min, max) {
  vL = Number.isFinite(min) ? Math.round(min) : vL;
  vR = Number.isFinite(max) ? Math.round(max) : vR;
  render(false);
}

export function initYearBox(recomputeOnly) {
  if (!yearBox || !yrSlider || !yrTrack || !yrThumbL || !yrThumbR) return;

  if (recomputeOnly) { render(false); return; }

  vL = Number.isFinite(state.yearRange?.min) ? +state.yearRange.min : YEAR_MIN;
  vR = Number.isFinite(state.yearRange?.max) ? +state.yearRange.max : YEAR_MAX;

  const dragLeft = d3.drag()
    .on('start', function () {
      yearBox.classList.add('dragging');
      try { d3.select(this).raise(); } catch (_) {}
      d3.select(this).classed('active', true);
    })
    .on('drag', event => {
      const W     = Math.max(1, yrTrack.getBoundingClientRect().width);
      const [px]  = d3.pointer(event, yrTrack);
      const yearToX = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, W]);
      const xToYear = d3.scaleLinear().domain([0, W]).range([YEAR_MIN, YEAR_MAX]);
      vL = Math.round(xToYear(clamp(clamp(px, 0, W), 0, yearToX(vR))));
      render();
    })
    .on('end', function () { yearBox.classList.remove('dragging'); d3.select(this).classed('active', false); });

  const dragRight = d3.drag()
    .on('start', function () {
      yearBox.classList.add('dragging');
      try { d3.select(this).raise(); } catch (_) {}
      d3.select(this).classed('active', true);
    })
    .on('drag', event => {
      const W     = Math.max(1, yrTrack.getBoundingClientRect().width);
      const [px]  = d3.pointer(event, yrTrack);
      const yearToX = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, W]);
      const xToYear = d3.scaleLinear().domain([0, W]).range([YEAR_MIN, YEAR_MAX]);
      vR = Math.round(xToYear(clamp(clamp(px, 0, W), yearToX(vL), W)));
      render();
    })
    .on('end', function () { yearBox.classList.remove('dragging'); d3.select(this).classed('active', false); });

  d3.select(yrThumbL).call(dragLeft);
  d3.select(yrThumbR).call(dragRight);

  d3.select(yrTrack).on('mousedown touchstart', event => {
    const W = Math.max(1, yrTrack.getBoundingClientRect().width);
    const yearToX = d3.scaleLinear().domain([YEAR_MIN, YEAR_MAX]).range([0, W]);
    const xToYear = d3.scaleLinear().domain([0, W]).range([YEAR_MIN, YEAR_MAX]);
    const [px] = d3.pointer(event, yrTrack);
    const clampedPx = clamp(px, 0, W);
    const xL = yearToX(vL), xR = yearToX(vR);
    const val = Math.round(xToYear(clampedPx));
    if (Math.abs(clampedPx - xL) <= Math.abs(clampedPx - xR)) vL = clamp(val, YEAR_MIN, vR);
    else vR = clamp(val, vL, YEAR_MAX);
    render();
  });

  render(false);
}
