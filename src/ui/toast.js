/* Toast notification + venue-loading overlay. */

const toastEl = document.getElementById('loadingToast');

export function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); }
export function toastHide() { toastEl.classList.remove('show'); }

// ── Venue-loading overlay ────────────────────────────────────────────────────

const _state = { timeoutId: null, onOpen: null };

export function showVenueLoading(msg = 'Loading venue details...') {
  let el = document.getElementById('venue-loading-dialog');
  if (!el) {
    el = document.createElement('div');
    el.id = 'venue-loading-dialog';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, {
      position: 'fixed', left: '0', top: '0', right: '0', bottom: '0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1400, background: 'rgba(0,0,0,0.32)',
    });
    const inner = document.createElement('div');
    Object.assign(inner.style, {
      background: 'rgba(0,0,0,0.7)', color: 'white',
      padding: '14px 18px', borderRadius: '8px',
      fontSize: '1rem', boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
    });
    inner.textContent = msg;
    el.appendChild(inner);
    document.body.appendChild(el);
  } else {
    el.style.display = 'flex';
    const inner = el.firstChild; if (inner) inner.textContent = msg;
  }

  if (_state.timeoutId) { clearTimeout(_state.timeoutId); _state.timeoutId = null; }
  if (_state.onOpen)    { window.removeEventListener('venuewindow:open', _state.onOpen); _state.onOpen = null; }

  const onOpen = () => { hideVenueLoading(); window.removeEventListener('venuewindow:open', onOpen); _state.onOpen = null; };
  _state.onOpen = onOpen;
  window.addEventListener('venuewindow:open', onOpen);
  _state.timeoutId = setTimeout(() => { hideVenueLoading(); _state.timeoutId = null; }, 10000);
}

export function hideVenueLoading() {
  const el = document.getElementById('venue-loading-dialog');
  if (el) el.style.display = 'none';
  try {
    if (_state.timeoutId) { clearTimeout(_state.timeoutId); _state.timeoutId = null; }
    if (_state.onOpen)    { window.removeEventListener('venuewindow:open', _state.onOpen); _state.onOpen = null; }
  } catch (e) { reportError('nonfatal', e); }
}
