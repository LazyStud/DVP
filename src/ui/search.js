/* Global fuzzy search over venues, players, and countries (Fuse.js). */
import Fuse from 'fuse.js';
import { state } from '../state.js';
import { getAllSearchVenues, getAllSearchPlayers } from '../data/queries.js';
import { openPlayer } from './playerWindow.js';
import { focusGlobeOn, focusMapOn } from '../layers/focus.js';
import { handleCountryClick } from '../layers/venues.js';
import { canonicalMapName } from '../data/names.js';
import { DEBUG } from '../debug.js';

const MAX_VENUES   = 4;
const MAX_PLAYERS  = 4;
const MAX_COUNTRIES = 3;

let fuseVenues    = null;
let fusePlayers   = null;
let fuseCountries = null;
let indexBuilt    = false;
let indexBuilding = false;

let wrap, input, dropdown;
let activeIdx = -1;
let results   = []; // flat list of { item, type } matching dropdown order

// ── Index build ───────────────────────────────────────────────────────────────

async function buildIndex() {
  if (indexBuilt || indexBuilding) return;
  indexBuilding = true;
  try {
    const [venues, players] = await Promise.all([
      getAllSearchVenues(),
      getAllSearchPlayers(),
    ]);

    fuseVenues = new Fuse(venues, {
      keys: ['venue', 'city', 'country'],
      threshold: 0.4,
      includeScore: true,
    });

    fusePlayers = new Fuse(players, {
      keys: ['name', 'team'],
      threshold: 0.35,
      includeScore: true,
    });

    const countryItems = (state.countries || [])
      .filter(f => {
        const cn = canonicalMapName(f.properties?.name || '');
        return cn && state.venueCountrySet?.has(cn);
      })
      .map(f => ({
        name:      f.properties?.name || '',
        canonical: canonicalMapName(f.properties?.name || ''),
        feature:   f,
      }));

    fuseCountries = new Fuse(countryItems, {
      keys: ['name', 'canonical'],
      threshold: 0.35,
      includeScore: true,
    });

    indexBuilt = true;
  } catch (e) {
    if (DEBUG) console.warn('search index build failed', e);
  } finally {
    indexBuilding = false;
  }
}

// ── Dropdown render ───────────────────────────────────────────────────────────

function renderDropdown(query) {
  dropdown.innerHTML = '';
  activeIdx = -1;
  results   = [];

  if (!query.trim()) { dropdown.hidden = true; return; }

  if (!indexBuilt) {
    appendEmptyMsg('Loading index…');
    dropdown.hidden = false;
    return;
  }

  const venueHits   = fuseVenues.search(query,   { limit: MAX_VENUES });
  const playerHits  = fusePlayers.search(query,  { limit: MAX_PLAYERS });
  const countryHits = fuseCountries.search(query, { limit: MAX_COUNTRIES });

  if (!venueHits.length && !playerHits.length && !countryHits.length) {
    appendEmptyMsg('No results');
    dropdown.hidden = false;
    return;
  }

  addSection('Venues',    venueHits,   'venue');
  addSection('Players',   playerHits,  'player');
  addSection('Countries', countryHits, 'country');

  dropdown.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function appendEmptyMsg(text) {
  const li = document.createElement('li');
  li.className = 'search-empty';
  li.textContent = text;
  dropdown.appendChild(li);
}

function addSection(label, hits, type) {
  if (!hits.length) return;

  const hdr = document.createElement('li');
  hdr.className = 'search-category';
  hdr.setAttribute('aria-hidden', 'true');
  hdr.textContent = label;
  dropdown.appendChild(hdr);

  for (const { item } of hits) {
    const li = document.createElement('li');
    li.className = 'search-item';
    li.setAttribute('role', 'option');
    li.dataset.idx = String(results.length);

    const nameEl = document.createElement('span');
    nameEl.className = 'search-item-name';
    nameEl.textContent = type === 'venue' ? item.venue : item.name;
    li.appendChild(nameEl);

    const metaEl = document.createElement('span');
    metaEl.className = 'search-item-meta';
    if (type === 'venue') {
      metaEl.textContent = [item.city, item.country].filter(Boolean).join(', ');
    } else if (type === 'player') {
      metaEl.textContent = `${item.team || ''}  ·  ${item.kind}`;
    }
    if (metaEl.textContent) li.appendChild(metaEl);

    li.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus on input so blur doesn't fire first
      selectResult({ item, type });
    });

    dropdown.appendChild(li);
    results.push({ item, type });
  }
}

// ── Selection action ──────────────────────────────────────────────────────────

async function selectResult({ item, type }) {
  closeDropdown();
  input.value = '';
  input.setAttribute('aria-expanded', 'false');

  if (type === 'venue') {
    const pointFeature = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.longitude, item.latitude] },
      properties: {},
    };
    try {
      if (state.mode === 'globe') await focusGlobeOn(pointFeature);
      else await focusMapOn(pointFeature);
    } catch (e) {
      if (DEBUG) console.warn('search focus failed', e);
    }
    setTimeout(() => { try { VenueWindow.open(item); } catch (e) { reportError('nonfatal', e); } }, 120);
  } else if (type === 'player') {
    openPlayer(item.name, item.team, item.kind);
  } else if (type === 'country') {
    try { handleCountryClick(item.feature); } catch (e) {
      if (DEBUG) console.warn('search country click failed', e);
    }
  }
}

// ── Keyboard navigation ───────────────────────────────────────────────────────

function moveActive(dir) {
  const items = dropdown.querySelectorAll('.search-item');
  if (!items.length) return;
  if (activeIdx === -1 && dir === -1) { activeIdx = items.length; }
  activeIdx = (activeIdx + dir + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle('search-item--active', i === activeIdx));
  items[activeIdx]?.scrollIntoView({ block: 'nearest' });
}

function closeDropdown() {
  dropdown.hidden = true;
  activeIdx = -1;
  dropdown.querySelectorAll('.search-item--active').forEach(el =>
    el.classList.remove('search-item--active')
  );
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initSearch() {
  wrap = document.createElement('div');
  wrap.id = 'searchWrap';
  wrap.className = 'search-wrap';
  wrap.setAttribute('role', 'combobox');
  wrap.setAttribute('aria-expanded', 'false');
  wrap.setAttribute('aria-haspopup', 'listbox');

  const iconEl = document.createElement('span');
  iconEl.className = 'search-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerHTML =
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `<circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/></svg>`;

  input = document.createElement('input');
  input.type = 'search';
  input.id = 'searchInput';
  input.className = 'search-input';
  input.placeholder = 'Search venues, players, countries…';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-label', 'Global search');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'searchDropdown');

  dropdown = document.createElement('ul');
  dropdown.id = 'searchDropdown';
  dropdown.className = 'search-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-label', 'Search results');
  dropdown.hidden = true;

  wrap.appendChild(iconEl);
  wrap.appendChild(input);
  wrap.appendChild(dropdown);
  document.body.appendChild(wrap);

  // Start building index in background immediately (no wait)
  buildIndex();

  input.addEventListener('input', () => renderDropdown(input.value));

  input.addEventListener('keydown', e => {
    if      (e.key === 'ArrowDown')  { e.preventDefault(); moveActive(+1); }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); moveActive(-1); }
    else if (e.key === 'Escape')     { closeDropdown(); input.blur(); }
    else if (e.key === 'Enter') {
      if (activeIdx >= 0 && results[activeIdx]) {
        e.preventDefault();
        selectResult(results[activeIdx]);
      }
    }
  });

  document.addEventListener('pointerdown', e => {
    if (!wrap.contains(e.target)) closeDropdown();
  });
}
