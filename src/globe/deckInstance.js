/* deckInstance.js — owns the Deck object lifetime, canvas element, and view state sync. */
import { Deck, _GlobeView as GlobeView } from '@deck.gl/core';
import { state } from '../state.js';

let _deck = null;
let _canvas = null;
let _viewState = { longitude: 0, latitude: -20, zoom: 0, bearing: 0, pitch: 0 };
let _onHover = null;
let _onClick = null;
let _onDblClick = null;
let _isDragging = false;
let _dragEndTimer = null;

export function initDeck(containerEl) {
  _canvas = document.createElement('canvas');
  _canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:auto;';
  containerEl.appendChild(_canvas);

  // Measure container synchronously so Deck sets its internal viewport dimensions
  // immediately — avoids the ResizeObserver race on first render.
  const rect = containerEl.getBoundingClientRect();
  const initW = Math.max(1, Math.round(rect.width));
  const initH = Math.max(1, Math.round(rect.height));

  _deck = new Deck({
    canvas: _canvas,
    width: initW,
    height: initH,
    views: new GlobeView({ id: 'globe' }),
    initialViewState: { ..._viewState },
    controller: true,
    layers: [],
    glOptions: { preserveDrawingBuffer: true },
    onViewStateChange: ({ viewState, interactionState }) => {
      _viewState = viewState;
      state.globeZoomK = Math.pow(2, viewState.zoom || 0);

      const dragging = !!interactionState?.isDragging;
      if (dragging && !_isDragging) {
        _isDragging = true;
        state.isDragging = true;
        state.stopSpin?.();
      }
      if (!dragging && _isDragging) {
        _isDragging = false;
        clearTimeout(_dragEndTimer);
        _dragEndTimer = setTimeout(() => {
          state.isDragging = false;
          if (state.mode === 'globe' && !state.countryFocused) state.startSpin?.();
        }, 400);
      }
    },
    onHover: info => { try { _onHover?.(info); } catch (e) { reportError('nonfatal', e); } },
    onClick: info => { try { _onClick?.(info); } catch (e) { reportError('nonfatal', e); } },
  });

  _canvas.addEventListener('dblclick', () => { try { _onDblClick?.(); } catch (e) { reportError('nonfatal', e); } });
}

export function setDeckCallbacks({ onHover, onClick, onDblClick }) {
  _onHover    = onHover    ?? _onHover;
  _onClick    = onClick    ?? _onClick;
  _onDblClick = onDblClick ?? _onDblClick;
}

export function setDeckLayers(layers) {
  if (_deck) _deck.setProps({ layers });
}

export function setDeckViewState(vs) {
  _viewState = { ..._viewState, ...vs };
  if (_deck) _deck.setProps({ initialViewState: { ..._viewState, transitionDuration: 0 } });
}

export function getDeckViewState() {
  return { ..._viewState };
}

export function showDeckCanvas() {
  if (_canvas) _canvas.style.display = 'block';
}

export function hideDeckCanvas() {
  if (_canvas) _canvas.style.display = 'none';
}

export function resizeDeck(w, h) {
  if (_deck) _deck.setProps({ width: w, height: h });
}

export function getDeckCanvas() {
  return _canvas;
}

/** Zoom level that makes the globe fill ~95 % of the smaller viewport dimension. */
export function computeGlobeFillZoom(dim, latitude = 0) {
  const zoomAdj = Math.log2(Math.PI * Math.cos(latitude * Math.PI / 180));
  return Math.log2(0.475 * Math.max(1, dim) / 256) + zoomAdj;
}

export function destroyDeck() {
  if (_deck) { _deck.finalize(); _deck = null; }
  if (_canvas?.parentNode) { _canvas.parentNode.removeChild(_canvas); _canvas = null; }
}
