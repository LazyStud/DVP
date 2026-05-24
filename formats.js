// formats.js — single source of truth for format-key normalisation and SQL LIKE patterns.
// Exposed as Formats on both the main thread (window) and web workers (self).
(function (root) {
  'use strict';

  // Collapse any raw format string to one of: 'test' | 'odi' | 't20' | 'all'
  function normalizeFormat(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (!s || s === 'all') return 'all';
    if (s.includes('test')) return 'test';
    if (s.includes('odi') || (s.includes('one') && s.includes('day'))) return 'odi';
    if (s.includes('t20') || s.includes('twenty')) return 't20';
    return 'all';
  }

  // Returns SQL LIKE patterns for a canonical format key.
  // Returns [] for 'all' — caller should omit the WHERE clause entirely.
  function formatLikePatterns(key) {
    if (key === 'test') return ['%test%'];
    if (key === 'odi')  return ['%odi%', '%one%day%', '%one-day%', '%one day%'];
    if (key === 't20')  return ['%t20i%', '%t20%', '%twenty%', '%twenty20%'];
    return [];
  }

  root.Formats = { normalizeFormat, formatLikePatterns };
})(typeof self !== 'undefined' ? self : window);
