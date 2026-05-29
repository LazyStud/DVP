/* Venue typology classification (T-3.4)
 * Classifies venues as "Batting paradise", "Balanced", or "Bowler-friendly"
 * using percentile ranks of batting_sr, boundary_pct, and bowling_avg across
 * all venues with ≥10 matches (per format).
 */

let _ctx = null;

function blank() {
  return { sr: [], bp: [], bavg: [] };
}

function pushIfFinite(bucket, r) {
  if (r.sr   != null && isFinite(+r.sr))   bucket.sr.push(+r.sr);
  if (r.bp   != null && isFinite(+r.bp))   bucket.bp.push(+r.bp);
  if (r.bavg != null && isFinite(+r.bavg)) bucket.bavg.push(+r.bavg);
}

function sortAll(bucket) {
  bucket.sr.sort((a, b) => a - b);
  bucket.bp.sort((a, b) => a - b);
  bucket.bavg.sort((a, b) => a - b);
}

// Binary-search percentile rank: fraction of array elements < x (0..1).
// Returns null if arr is empty or x is not finite.
function pctRank(arr, x) {
  if (!arr || arr.length === 0 || x == null || !isFinite(x)) return null;
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < x) lo = mid + 1; else hi = mid;
  }
  return lo / arr.length;
}

function normalizeFormat(f) {
  if (!f) return 'all';
  const s = String(f).toLowerCase().trim();
  if (s.startsWith('test')) return 'test';
  if (s.startsWith('odi') || s === 'one day international') return 'odi';
  if (s.startsWith('t20') || s === 't20i') return 't20';
  return 'all';
}

export async function loadTypologyContext(DB) {
  if (_ctx) return _ctx;

  // Build canonical name map so renamed venues (e.g. "Westpac Stadium" →
  // "Sky Stadium") appear as one data point in the percentile distribution.
  const canonicalMap = new Map();
  try {
    const venueRows = DB.queryAll('SELECT venue, names FROM venues') || [];
    for (const row of venueRows) {
      const canonical = String(row.venue || '').trim();
      if (!canonical) continue;
      canonicalMap.set(canonical.toLowerCase(), canonical);
      if (row.names) {
        String(row.names).split(';').forEach(n => {
          const name = n.trim().toLowerCase();
          if (name) canonicalMap.set(name, canonical);
        });
      }
    }
  } catch (_) { /* empty */ }

  const sql = `
    SELECT LOWER(venue_name) AS v, LOWER(format) AS f,
           SUM(CAST(matches AS INT))         AS m,
           AVG(CAST(batting_sr   AS REAL))   AS sr,
           AVG(CAST(boundary_pct AS REAL))   AS bp,
           AVG(CAST(bowling_avg  AS REAL))   AS bavg
    FROM venue_stats
    WHERE venue_name IS NOT NULL
    GROUP BY v, f
    HAVING m >= 10`;
  let rawRows;
  try { rawRows = DB.queryAll(sql) || []; } catch (_) { rawRows = []; }

  // Re-aggregate by canonical name using weighted averages.
  const canonAgg = new Map();
  for (const r of rawRows) {
    const canonical = canonicalMap.get(String(r.v || '').trim()) || r.v || '';
    const key = `${canonical}::${r.f}`;
    const m = +r.m || 0;
    const cur = canonAgg.get(key);
    if (!cur) {
      canonAgg.set(key, { v: canonical, f: r.f, m, sr_w: (+r.sr||0)*m, bp_w: (+r.bp||0)*m, bavg_w: (+r.bavg||0)*m });
    } else {
      cur.m      += m;
      cur.sr_w   += (+r.sr||0)   * m;
      cur.bp_w   += (+r.bp||0)   * m;
      cur.bavg_w += (+r.bavg||0) * m;
    }
  }
  const rows = [];
  for (const agg of canonAgg.values()) {
    if (agg.m < 10) continue;
    rows.push({ v: agg.v, f: agg.f, m: agg.m,
      sr:   agg.m > 0 ? agg.sr_w   / agg.m : null,
      bp:   agg.m > 0 ? agg.bp_w   / agg.m : null,
      bavg: agg.m > 0 ? agg.bavg_w / agg.m : null,
    });
  }

  const by = { test: blank(), odi: blank(), t20: blank(), all: blank() };
  for (const r of rows) {
    const k = normalizeFormat(r.f);
    if (k !== 'all') pushIfFinite(by[k], r);
    pushIfFinite(by.all, r);
  }
  Object.values(by).forEach(sortAll);
  _ctx = by;
  return _ctx;
}

// Returns { key, label, score } or null.
// metrics: { batting_sr, boundary_pct, bowling_avg, matches_count }
// format:  'test'|'odi'|'t20'|'all'
// ctx:     result of loadTypologyContext()
//
// Score = pctRank(sr) + pctRank(bp) + pctRank(bavg), all three pointing in
// the batting-friendly direction (high bowling_avg = bowler struggles = batter
// paradise). Range 0..3; ≥2.0 → batting, ≤1.0 → bowling, else balanced.
export function classifyVenue(metrics, format, ctx) {
  if (!metrics || (metrics.matches_count | 0) < 10) return null;
  const bucket = (ctx && ctx[format]) || (ctx && ctx.all);
  if (!bucket || bucket.sr.length < 5) return null;

  const pSr  = pctRank(bucket.sr,   metrics.batting_sr);
  const pBp  = pctRank(bucket.bp,   metrics.boundary_pct);
  const pBa  = pctRank(bucket.bavg, metrics.bowling_avg);
  if (pSr == null || pBp == null || pBa == null) return null;

  const score = pSr + pBp + pBa;

  if (score >= 2.0) return { key: 'batting',  label: 'Batting paradise', score };
  if (score <= 1.0) return { key: 'bowling',  label: 'Bowler-friendly',  score };
  return               { key: 'balanced', label: 'Balanced',         score };
}

// Exposed for testing — resets the module-level context cache.
export function _resetContext() { _ctx = null; }
