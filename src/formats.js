export function normalizeFormat(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s || s === 'all') return 'all';
  if (s.includes('test')) return 'test';
  if (s.includes('odi') || (s.includes('one') && s.includes('day'))) return 'odi';
  if (s.includes('t20') || s.includes('twenty')) return 't20';
  return 'all';
}

export function formatLikePatterns(key) {
  if (key === 'test') return ['%test%'];
  if (key === 'odi')  return ['%odi%', '%one%day%', '%one-day%', '%one day%'];
  if (key === 't20')  return ['%t20i%', '%t20%', '%twenty%', '%twenty20%'];
  return [];
}

export const Formats = { normalizeFormat, formatLikePatterns };
