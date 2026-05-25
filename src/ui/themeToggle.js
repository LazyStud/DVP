const STORAGE_KEY = 'gci-theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isLight = theme === 'light';
  btn.textContent  = isLight ? '☾' : '☀';
  btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
  btn.title        = isLight ? 'Switch to dark theme' : 'Switch to light theme';
}

export function initThemeToggle() {
  const saved = localStorage.getItem(STORAGE_KEY) || 'dark';
  applyTheme(saved);

  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
  });
}
