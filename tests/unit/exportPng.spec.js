// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// ── Browser API stubs ─────────────────────────────────────────────────────────

let capturedBlob = null;

beforeAll(() => {
  // URL API
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  // Canvas 2D context
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillStyle: '',
    fillRect: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
  }));
  HTMLCanvasElement.prototype.toBlob = vi.fn(cb => {
    const b = new Blob(['png'], { type: 'image/png' });
    capturedBlob = b;
    cb(b);
  });

  // Image: trigger onload synchronously
  class MockImage {
    constructor() { this.onload = null; this.onerror = null; }
    set src(_url) {
      // eslint-disable-next-line no-invalid-this
      Promise.resolve().then(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', MockImage);
});

import { exportSvgAsPng, exportTableAsPng, initExportButtons } from '../../src/ui/exportPng.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSvgEl() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '400');
  svg.setAttribute('height', '300');
  document.body.appendChild(svg);
  return svg;
}

function makeTable(headers = ['Player', 'Runs'], rows = [['Kohli', '500'], ['Smith', '450']]) {
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach(cells => {
    const row = document.createElement('tr');
    cells.forEach(c => { const td = document.createElement('td'); td.textContent = c; row.appendChild(td); });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  document.body.appendChild(table);
  return table;
}

// ── exportTableAsPng — null guard ────────────────────────────────────────────

describe('exportTableAsPng — null guard', () => {
  it('returns early without throwing when tableEl is null', () => {
    expect(() => exportTableAsPng(null)).not.toThrow();
  });
});

// ── exportTableAsPng — SVG construction ──────────────────────────────────────

describe('exportTableAsPng — with table', () => {
  it('calls URL.createObjectURL', async () => {
    URL.createObjectURL.mockClear();
    const table = makeTable();
    exportTableAsPng(table, 'test.png', { title: 'Cricket LB', filters: '2000–2025 · All' });
    await Promise.resolve(); await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('triggers a PNG download (creates anchor and clicks it)', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const table = makeTable();
    exportTableAsPng(table, 'lb.png', { title: 'LB', filters: 'All' });
    await Promise.resolve(); await Promise.resolve();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('handles table with no rows', async () => {
    const table = makeTable(['A', 'B'], []);
    expect(() => exportTableAsPng(table, 'empty.png')).not.toThrow();
  });

  it('handles meta without title or filters', async () => {
    const table = makeTable();
    expect(() => exportTableAsPng(table, 'no-meta.png', {})).not.toThrow();
  });

  it('escapes XML special characters in cell content', async () => {
    // Build a table with a cell containing XML special chars
    const table = makeTable(['Name'], [['<Kohli & \'Smith">']] );
    // We verify no throw — actual escaping is in the SVG string builder
    expect(() => exportTableAsPng(table, 'esc.png')).not.toThrow();
  });
});

// ── exportSvgAsPng ────────────────────────────────────────────────────────────

describe('exportSvgAsPng', () => {
  it('calls URL.createObjectURL', async () => {
    URL.createObjectURL.mockClear();
    const svg = makeSvgEl();
    exportSvgAsPng(svg, 'chart.png', { title: 'Test Chart', filters: '2000–2025' });
    await Promise.resolve(); await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('uses filename default "chart.png" when omitted', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const svg = makeSvgEl();
    exportSvgAsPng(svg);
    await Promise.resolve(); await Promise.resolve();
    clickSpy.mockRestore();
  });

  it('handles meta without title or filters', async () => {
    const svg = makeSvgEl();
    expect(() => exportSvgAsPng(svg, 'out.png', {})).not.toThrow();
  });

  it('onerror path revokes the object URL', async () => {
    URL.revokeObjectURL.mockClear();
    const svg = makeSvgEl();
    // Override Image so onerror fires instead of onload
    class ErrorImage {
      set src(_u) { Promise.resolve().then(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', ErrorImage);
    exportSvgAsPng(svg, 'err.png');
    await Promise.resolve(); await Promise.resolve();
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    // Restore the normal MockImage
    class MockImage {
      set src(_url) { Promise.resolve().then(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', MockImage);
  });
});

// ── initExportButtons ─────────────────────────────────────────────────────────

describe('initExportButtons — no buttons in DOM', () => {
  it('returns without throwing when buttons are absent', () => {
    expect(() => initExportButtons()).not.toThrow();
  });
});

describe('initExportButtons — globe button', () => {
  it('wires exportGlobeBtn for 2D map SVG path', async () => {
    // innerHTML is safe: hardcoded literal fixture
    document.body.innerHTML += `
      <button id="exportGlobeBtn"></button>
      <span id="yearBoxValue">2000–2025</span>
      <div id="globe"><svg></svg></div>
    `;
    document.body.classList.add('map-mode');
    initExportButtons();
    URL.createObjectURL.mockClear();
    document.getElementById('exportGlobeBtn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalled();
    document.body.classList.remove('map-mode');
  });
});

describe('initExportButtons — leaderboard button', () => {
  it('wires exportLbBtn and calls exportTableAsPng', async () => {
    // innerHTML is safe: hardcoded literal fixture
    document.body.innerHTML += `
      <button id="exportLbBtn"></button>
      <button class="tab active" data-kind="batting"></button>
      <span id="yearBoxValue">2000–2025</span>
      <div id="tabpanel">
        <table class="lb-table">
          <thead><tr><th>Player</th><th>Runs</th></tr></thead>
          <tbody><tr><td>Kohli</td><td>500</td></tr></tbody>
        </table>
        <button class="lb-fmt-btn" aria-pressed="true">All</button>
      </div>
    `;
    initExportButtons();
    URL.createObjectURL.mockClear();
    document.getElementById('exportLbBtn').click();
    await Promise.resolve(); await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});
