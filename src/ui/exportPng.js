/* exportPng.js — PNG export for globe/map SVG, venue radar/evolution SVG, leaderboard table. */

const DPR = 2;
const BAR_H = 52; // height of the metadata header strip added to every PNG

const INLINE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'opacity',
  'font-size', 'font-family', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline',
  'display', 'visibility',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Read resolved CSS custom-property tokens from the root element so exported
// images match whichever theme (dark/light) is active when the user clicks.
function themeTokens() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const cs    = getComputedStyle(document.documentElement);
  const get   = p => cs.getPropertyValue(p).trim();
  return {
    theme,
    canvasBg: theme === 'light' ? '#f5f0e8' : '#030c0f',
    panelBg:  get('--panel-bg')     || (theme === 'light' ? 'rgba(255,252,244,0.97)' : 'rgba(3,12,15,0.95)'),
    text:     get('--text')         || (theme === 'light' ? '#1a2027' : '#fffdf5'),
    muted:    get('--muted')        || (theme === 'light' ? '#556372' : '#b9dace'),
    border:   get('--panel-border') || (theme === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(255,200,140,0.08)'),
    headBg:   theme === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,200,140,0.06)',
    altRow:   theme === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
    fg:       theme === 'light' ? '#1a2027' : '#fffdf5',
  };
}

// Recursively inline computed CSS values from the original element tree into the
// clone so the serialised standalone SVG renders without the page stylesheet.
// Resolves CSS custom properties (var(--ocean), var(--muted), etc.) to their
// actual colour values.
function inlineEl(origEl, cloneEl) {
  const cs    = getComputedStyle(origEl);
  const parts = [];
  for (const p of INLINE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) parts.push(`${p}:${v}`);
  }
  if (parts.length) cloneEl.style.cssText = parts.join(';');

  const oc = origEl.children;
  const cc = cloneEl.children;
  for (let i = 0; i < oc.length && i < cc.length; i++) {
    inlineEl(oc[i], cc[i]);
  }
}

// Build the SVG elements that form the metadata header bar.
// Returns an array of SVGElement nodes to append to the outer wrapper SVG.
function buildHeaderNodes(ns, w, meta, tok) {
  const nodes = [];

  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width',  w);
  bg.setAttribute('height', BAR_H);
  bg.setAttribute('fill',   tok.panelBg);
  nodes.push(bg);

  if (meta.title) {
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', 12);
    t.setAttribute('y', 22);
    t.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    t.setAttribute('font-size',   '14');
    t.setAttribute('font-weight', '600');
    t.setAttribute('fill', tok.text);
    t.textContent = meta.title;
    nodes.push(t);
  }

  if (meta.filters) {
    const f = document.createElementNS(ns, 'text');
    f.setAttribute('x', 12);
    f.setAttribute('y', 40);
    f.setAttribute('font-family', 'system-ui, -apple-system, sans-serif');
    f.setAttribute('font-size',   '11');
    f.setAttribute('fill', tok.muted);
    f.textContent = meta.filters;
    nodes.push(f);
  }

  const divider = document.createElementNS(ns, 'line');
  divider.setAttribute('x1', 0);    divider.setAttribute('y1', BAR_H);
  divider.setAttribute('x2', w);    divider.setAttribute('y2', BAR_H);
  divider.setAttribute('stroke', tok.border);
  divider.setAttribute('stroke-width', '1');
  nodes.push(divider);

  return nodes;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Clones an SVG element, inlines computed styles, prepends a metadata header
 * bar, draws to a 2× canvas, and triggers a PNG download.
 *
 * @param {SVGElement} svgEl
 * @param {string}     [filename]
 * @param {{ title?: string, filters?: string }} [meta]
 *   title   — bold heading shown at top-left of the PNG
 *   filters — smaller text below the title (year range, format, mode, etc.)
 */
export function exportSvgAsPng(svgEl, filename = 'chart.png', meta = {}) {
  const tok = themeTokens();

  const rect = svgEl.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width)  || +svgEl.getAttribute('width')  || 800);
  const h = Math.max(1, Math.round(rect.height) || +svgEl.getAttribute('height') || 600);
  const totalH = h + BAR_H;

  // Clone and inline the original SVG content
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width',  w);
  clone.setAttribute('height', h);
  clone.setAttribute('x', 0);
  clone.setAttribute('y', BAR_H); // shift content below the header bar
  clone.removeAttribute('xmlns'); // will be set on the outer wrapper
  inlineEl(svgEl, clone);

  // Build outer wrapper SVG: header bar + original content nested as inner <svg>
  const ns    = 'http://www.w3.org/2000/svg';
  const outer = document.createElementNS(ns, 'svg');
  outer.setAttribute('xmlns',  ns);
  outer.setAttribute('width',  w);
  outer.setAttribute('height', totalH);

  buildHeaderNodes(ns, w, meta, tok).forEach(n => outer.appendChild(n));
  outer.appendChild(clone);

  const xml  = new XMLSerializer().serializeToString(outer);
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = w * DPR;
    canvas.height = totalH * DPR;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = tok.canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR, DPR);
    ctx.drawImage(img, 0, 0, w, totalH);
    URL.revokeObjectURL(url);
    canvas.toBlob(b => { if (b) triggerDownload(b, filename); }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

/**
 * Reads an HTML <table> element and renders it as a styled SVG PNG download.
 * Resolves theme colours at call-time so dark and light modes both look correct.
 *
 * @param {HTMLTableElement} tableEl
 * @param {string}           [filename]
 * @param {{ title?: string, filters?: string }} [meta]
 */
export function exportTableAsPng(tableEl, filename = 'leaderboard.png', meta = {}) {
  if (!tableEl) return;

  const tok     = themeTokens();
  const { fg, muted, headBg, altRow, canvasBg } = tok;
  const bg      = tok.canvasBg;
  const borderC = tok.border;

  const thEls   = Array.from(tableEl.querySelectorAll('thead th'));
  const trEls   = Array.from(tableEl.querySelectorAll('tbody tr'));
  const headers = thEls.map(th => th.textContent.trim());
  const rows    = trEls.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));

  // Mirror actual rendered column widths so the PNG proportions match the on-screen table.
  const colWidths = thEls.map(th => Math.max(44, Math.round(th.getBoundingClientRect().width)));
  const PAD_X  = 10, ROW_H = 26, COL_HEADER_H = 34, PAD_TOP = 8, PAD_BOT = 8;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  const totalH = BAR_H + PAD_TOP + COL_HEADER_H + ROW_H * rows.length + PAD_BOT;

  const p = [];  // SVG string parts
  p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}">`);
  p.push(`<rect width="${totalW}" height="${totalH}" fill="${bg}"/>`);

  // ── Metadata header bar ───────────────────────────────────────────────────
  p.push(`<rect width="${totalW}" height="${BAR_H}" fill="${tok.panelBg}"/>`);
  if (meta.title) {
    p.push(`<text x="12" y="22" fill="${fg}" font-size="14" font-family="system-ui,sans-serif" font-weight="600">${escXml(meta.title)}</text>`);
  }
  if (meta.filters) {
    p.push(`<text x="12" y="40" fill="${muted}" font-size="11" font-family="system-ui,sans-serif">${escXml(meta.filters)}</text>`);
  }
  p.push(`<line x1="0" y1="${BAR_H}" x2="${totalW}" y2="${BAR_H}" stroke="${borderC}" stroke-width="1"/>`);

  // ── Column header row ────────────────────────────────────────────────────
  const tblTop = BAR_H + PAD_TOP;
  p.push(`<rect y="${tblTop}" width="${totalW}" height="${COL_HEADER_H}" fill="${headBg}"/>`);
  p.push(`<line x1="0" y1="${tblTop + COL_HEADER_H}" x2="${totalW}" y2="${tblTop + COL_HEADER_H}" stroke="${borderC}" stroke-width="1"/>`);

  let x = 0;
  headers.forEach((text, i) => {
    const midY = tblTop + COL_HEADER_H / 2 + 4;
    p.push(`<text x="${x + PAD_X}" y="${midY}" fill="${muted}" font-size="11" font-family="system-ui,sans-serif" font-weight="600">${escXml(text)}</text>`);
    x += colWidths[i];
  });

  // ── Data rows ────────────────────────────────────────────────────────────
  rows.forEach((row, ri) => {
    const rowY = tblTop + COL_HEADER_H + ri * ROW_H;
    if (ri % 2 === 1) {
      p.push(`<rect y="${rowY}" width="${totalW}" height="${ROW_H}" fill="${altRow}"/>`);
    }
    let cx = 0;
    row.forEach((cell, ci) => {
      const cw = ci < colWidths.length ? colWidths[ci] : 60;
      p.push(`<text x="${cx + PAD_X}" y="${rowY + ROW_H / 2 + 4}" fill="${fg}" font-size="12" font-family="system-ui,sans-serif">${escXml(cell)}</text>`);
      cx += cw;
    });
  });

  p.push('</svg>');

  const xml  = p.join('\n');
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = totalW * DPR;
    canvas.height = totalH * DPR;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR, DPR);
    ctx.drawImage(img, 0, 0, totalW, totalH);
    URL.revokeObjectURL(url);
    canvas.toBlob(b => { if (b) triggerDownload(b, filename); }, 'image/png');
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// ── Button wiring ─────────────────────────────────────────────────────────────

/**
 * Wires the globe export button and the leaderboard export button.
 * The venue radar/evolution button is wired inside venue.js via window.exportSvgAsPng.
 * Call once during app init, after DOM is ready.
 */
export function initExportButtons() {
  // ── Globe / map ───────────────────────────────────────────────────────────
  const globeBtn = document.getElementById('exportGlobeBtn');
  if (globeBtn) {
    globeBtn.addEventListener('click', () => {
      const yearText = document.getElementById('yearBoxValue')?.textContent?.replace('Years ', '') || '2000–2025';
      const rawFmt   = (window.selectedFormat || 'all');
      const fmt      = rawFmt === 'all' ? 'All formats' : rawFmt.toUpperCase();
      const isMap    = document.body.classList.contains('map-mode');
      const mode     = isMap ? '2D Map' : '3D Globe';

      if (!isMap) {
        // deck.gl canvas — requires preserveDrawingBuffer: true (set in deckInstance.js)
        const deckCanvas = document.querySelector('#globe canvas');
        if (deckCanvas) {
          deckCanvas.toBlob(b => { if (b) { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cricket-globe.png'; a.click(); } }, 'image/png');
          return;
        }
      }

      const svgEl = document.querySelector('#globe svg');
      if (!svgEl) return;
      exportSvgAsPng(svgEl, 'cricket-globe.png', {
        title:   `Global Cricket Insights — ${mode}`,
        filters: `${yearText} · ${fmt}`,
      });
    });
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const lbBtn = document.getElementById('exportLbBtn');
  if (lbBtn) {
    lbBtn.addEventListener('click', () => {
      const table = document.querySelector('#tabpanel .lb-table');
      if (!table) return;

      const kind     = document.querySelector('.tab.active')?.dataset?.kind || 'leaderboard';
      const yearText = document.getElementById('yearBoxValue')?.textContent?.replace('Years ', '') || '2000–2025';
      const fmtBtn   = document.querySelector('#tabpanel .lb-fmt-btn[aria-pressed="true"]');
      const fmt      = fmtBtn?.textContent?.trim() || 'All';

      exportTableAsPng(table, `cricket-leaderboard-${kind}.png`, {
        title:   `Cricket Leaderboard — ${kind.charAt(0).toUpperCase() + kind.slice(1)}`,
        filters: `${yearText} · Format: ${fmt}`,
      });
    });
  }
}
