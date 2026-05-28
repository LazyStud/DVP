/* Insights feed data layer (T-3.7).
 * Builds a pool of factoid objects from pre-computed state + lightweight SQL.
 * All template functions are synchronous after DB.init; they fail silently.
 */
import { DEBUG } from '../debug.js';
import { state } from '../state.js';

const FMT_LABEL = { test: 'Tests', odi: 'ODIs', t20: 'T20Is' };

function pct(v) { return Math.round(v * 100); }

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Template 1: best home win % per format (from state.choroByCountry) ────────

function homeDominance() {
  const out = [];
  const choro = state.choroByCountry;
  if (!choro?.size) return out;
  for (const fmt of ['test', 'odi', 't20']) {
    let best = null;
    for (const [country, rec] of choro) {
      const f = rec.formats[fmt];
      if (!f || f.matches < 20) continue;
      if (!best || f.winPct > best.winPct) best = { country, winPct: f.winPct, matches: f.matches };
    }
    if (best && best.winPct > 0.55) {
      out.push({
        text: `${titleCase(best.country)} won ${pct(best.winPct)}% of home ${FMT_LABEL[fmt]} (2000–2025)`,
        category: 'home',
      });
    }
  }
  return out;
}

// ── Template 2: most matches hosted per format (from state.choroByCountry) ───

function mostHosted() {
  const out = [];
  const choro = state.choroByCountry;
  if (!choro?.size) return out;
  for (const fmt of ['test', 'odi', 't20']) {
    let best = null;
    for (const [country, rec] of choro) {
      const f = rec.formats[fmt];
      if (!f || f.matches < 10) continue;
      if (!best || f.matches > best.matches) best = { country, matches: f.matches };
    }
    if (best) {
      out.push({
        text: `${titleCase(best.country)} hosted more ${FMT_LABEL[fmt]} than any other nation — ${best.matches.toLocaleString()} matches (2000–2025)`,
        category: 'venue',
      });
    }
  }
  return out;
}

// ── Template 3: three busiest venues overall ──────────────────────────────────

function busiestVenues() {
  const out = [];
  try {
    const rows = DB.queryAll(`
      SELECT venue_name, SUM(matches_with_result) AS total
      FROM venue_stats_format
      GROUP BY venue_name
      HAVING total >= 10
      ORDER BY total DESC
      LIMIT 3
    `) || [];
    for (const r of rows) {
      const n = +r.total || 0;
      out.push({
        text: `${r.venue_name} has hosted ${n.toLocaleString()} international matches, one of cricket's busiest grounds`,
        category: 'venue',
      });
    }
  } catch (e) {
    if (DEBUG) console.warn('insights: busiestVenues failed', e);
  }
  return out;
}

// ── Template 4: top run-scorer per format ─────────────────────────────────────

function topScorers() {
  const out = [];
  try {
    for (const fmt of ['test', 'odi', 't20']) {
      const patterns = Formats.formatLikePatterns(fmt);
      if (!patterns.length) continue;
      const fmtCond = patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ');
      const rows = DB.queryAll(`
        SELECT bi.batter AS player,
               SUM(CAST(bi.runs AS INT)) AS total_runs
        FROM batting_innings bi
        LEFT JOIN matches m ON bi.match_id = m.match_id
        WHERE (${fmtCond})
        GROUP BY bi.batter
        HAVING total_runs > 500
        ORDER BY total_runs DESC
        LIMIT 1
      `, patterns) || [];
      if (rows.length) {
        const runs = (+rows[0].total_runs).toLocaleString();
        out.push({
          text: `${rows[0].player} leads all ${FMT_LABEL[fmt]} batters in this dataset with ${runs} runs`,
          category: 'batting',
        });
      }
    }
  } catch (e) {
    if (DEBUG) console.warn('insights: topScorers failed', e);
  }
  return out;
}

// ── Template 5: top wicket-taker per format ───────────────────────────────────

function topWicketTakers() {
  const out = [];
  try {
    for (const fmt of ['test', 'odi', 't20']) {
      const patterns = Formats.formatLikePatterns(fmt);
      if (!patterns.length) continue;
      const fmtCond = patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ');
      const rows = DB.queryAll(`
        SELECT bi.bowler AS player,
               SUM(CAST(bi.wickets AS INT)) AS total_wkts
        FROM bowling_innings bi
        LEFT JOIN matches m ON bi.match_id = m.match_id
        WHERE (${fmtCond})
        GROUP BY bi.bowler
        HAVING total_wkts > 30
        ORDER BY total_wkts DESC
        LIMIT 1
      `, patterns) || [];
      if (rows.length) {
        out.push({
          text: `${rows[0].player} is the leading ${FMT_LABEL[fmt]} wicket-taker in this dataset with ${+rows[0].total_wkts} wickets`,
          category: 'bowling',
        });
      }
    }
  } catch (e) {
    if (DEBUG) console.warn('insights: topWicketTakers failed', e);
  }
  return out;
}

// ── Template 6: T20 format growth from 2000s to 2010s ────────────────────────

function formatGrowth() {
  const out = [];
  try {
    const rows = DB.queryAll(`
      SELECT LOWER(COALESCE(format, '')) AS fmt,
             CAST(year / 10 AS INT) * 10 AS decade,
             SUM(matches_with_result)    AS n
      FROM venue_stats_format
      WHERE year >= 2000
      GROUP BY fmt, decade
    `) || [];
    let t20_00 = 0, t20_10 = 0;
    for (const r of rows) {
      const isT20 = r.fmt.includes('t20') || r.fmt.includes('twenty');
      if (!isT20) continue;
      if (+r.decade === 2000) t20_00 += +r.n || 0;
      if (+r.decade === 2010) t20_10 += +r.n || 0;
    }
    if (t20_00 > 0 && t20_10 > 0) {
      const factor = (t20_10 / t20_00).toFixed(1);
      out.push({
        text: `T20 internationals grew ${factor}× from the 2000s to the 2010s, cementing cricket's fastest-growing format`,
        category: 'format',
      });
    }
  } catch (e) {
    if (DEBUG) console.warn('insights: formatGrowth failed', e);
  }
  return out;
}

// ── Pool assembly ─────────────────────────────────────────────────────────────

export async function computeInsightPool() {
  await DB.init(window._DB_URL || './data/db/cricket.db');
  return [
    ...homeDominance(),
    ...mostHosted(),
    ...busiestVenues(),
    ...topScorers(),
    ...topWicketTakers(),
    ...formatGrowth(),
  ].filter(Boolean);
}

// ── Picker: Fisher-Yates shuffle → first N ────────────────────────────────────

export function pickFive(pool) {
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(5, arr.length));
}
