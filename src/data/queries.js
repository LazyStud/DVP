/* DB queries — pure data computation, no draw calls.
 * After calling compute*, callers in main.js trigger the draw functions.
 * Accesses globals: DB (db.js), Formats (formats.js), d3 (CDN).
 */
import { DEBUG }                          from '../debug.js';
import { state }                          from '../state.js';
import {
  canonicalMapName, canonicalTeamName, hostToHomeTeamCountry,
  WINNER_SYNS, DATE_SYNS, HOST_SYNS, NEUTRAL_SYNS, RESULT_SYNS, FORMAT_SYNS,
  TEAM1_SYNS, TEAM2_SYNS,
} from './names.js';
import { aggregateChoropleth } from './choropleth.js';
import { LRU, cacheKey } from './lru.js';
import { wilsonInterval } from './stats.js';

// ── LRU caches for expensive SQL queries ─────────────────────────────────────

const choroCache = new LRU(12);
const flowsCache = new LRU(12);

// ── Venue canonical-name helper ───────────────────────────────────────────────
// Returns Map<historicalNameLower → canonicalName> built from the venues table.
// Used wherever a query groups by raw venue_name and needs to merge renamed venues.
let _venueCanonMap = null;
function getVenueCanonicalMap() {
  if (_venueCanonMap) return _venueCanonMap;
  const map = new Map();
  try {
    const rows = DB.queryAll('SELECT venue, names FROM venues') || [];
    for (const row of rows) {
      const canonical = String(row.venue || '').trim();
      if (!canonical) continue;
      map.set(canonical.toLowerCase(), canonical);
      if (row.names) {
        String(row.names).split(';').forEach(n => {
          const name = n.trim().toLowerCase();
          if (name) map.set(name, canonical);
        });
      }
    }
  } catch (e) { reportError('nonfatal', e); }
  _venueCanonMap = map;
  return map;
}

let _matchViewSql = null;
// Returns a SQL string usable as a FROM target. Discovers actual match-table
// names and normalises team1/team2 column aliases so H2H and player queries
// are not hard-coded to a table named 'matches'.
// Cached after first call — table structure is static per session.
export function matchView() {
  if (_matchViewSql !== null) return _matchViewSql;
  let tables;
  try { tables = loadMatchTables().filter(t => t.map.team1Col && t.map.team2Col); }
  catch (_) { tables = []; }
  if (!tables.length) { _matchViewSql = 'matches'; return _matchViewSql; }
  const pick = (cols, syns) => syns.find(s => cols.includes(s));
  const parts = tables.map(t => {
    const c = t.map, cols = t.cols;
    const mid = pick(cols, ['match_id', 'id', 'matchid', 'game_id']);
    const wm  = pick(cols, ['win_margin', 'margin']);
    const vn  = pick(cols, ['venue_name', 'venue', 'ground']);
    const ct  = pick(cols, ['city', 'venue_city']);
    const pom = pick(cols, ['player_of_match', 'pom', 'man_of_match']);
    return (
      `SELECT COALESCE(${c.winnerCol},'') AS winner,` +
      ` ${c.team1Col} AS team1,` +
      ` ${c.team2Col} AS team2,` +
      ` ${c.dateCol}  AS date,` +
      ` COALESCE(${c.resultCol || "''"},'') AS result_type,` +
      ` COALESCE(${c.formatCol || "''"},'') AS format,` +
      ` ${mid ? mid : 'NULL'} AS match_id,` +
      ` ${wm  ? `COALESCE(${wm},'')` : "''"} AS win_margin,` +
      ` ${vn  ? `COALESCE(${vn},'')` : "''"} AS venue_name,` +
      ` ${ct  ? `COALESCE(${ct},'')` : "''"} AS city,` +
      ` ${pom ? `COALESCE(${pom},'')` : "''"} AS player_of_match` +
      ` FROM ${t.name}`
    );
  });
  _matchViewSql = `(${parts.join(' UNION ALL ')})`;
  return _matchViewSql;
}

// ── Schema cache ─────────────────────────────────────────────────────────────

let schemaCache = null;

export async function getVenueSchema() {
  if (schemaCache) return schemaCache;
  await DB.init(window._DB_URL || './data/db/cricket.db');
  try { DB.queryAll("SELECT name FROM sqlite_master WHERE type='table'"); } catch (e) { reportError('nonfatal', e); }
  const colsRows = DB.queryAll('PRAGMA table_info(venues)');
  const cols = colsRows.map(r => (r.name || '').toLowerCase());
  schemaCache = {
    cols,
    countryCol: ['country', 'country_name', 'countrytext', 'nation', 'state', 'venue_country'].find(c => cols.includes(c)) || null,
    lonCol:     ['longitude', 'lon', 'lng', 'long', 'x'].find(c => cols.includes(c)) || null,
    latCol:     ['latitude', 'lat', 'y'].find(c => cols.includes(c)) || null,
    iso3:       cols.includes('iso3') ? 'iso3' : null,
    iso2:       cols.includes('iso2') ? 'iso2' : null,
  };
  return schemaCache;
}

// ── Match table discovery ────────────────────────────────────────────────────

export function loadMatchTables() {
  const names = DB.queryAll("SELECT name FROM sqlite_master WHERE type='table'")
                  .map(r => r.name).filter(Boolean);
  const out = [];
  for (const n of names) {
    const cols = DB.queryAll(`PRAGMA table_info(${n})`).map(r => (r.name || '').toLowerCase());
    const winnerCol  = WINNER_SYNS.find(c => cols.includes(c));
    const dateCol    = DATE_SYNS.find(c   => cols.includes(c));
    const hostCol    = HOST_SYNS.find(c   => cols.includes(c));
    if (winnerCol && dateCol && hostCol) {
      out.push({ name: n, cols, map: {
        winnerCol,
        dateCol,
        hostCol,
        neutralCol: NEUTRAL_SYNS.find(c => cols.includes(c)),
        resultCol:  RESULT_SYNS.find(c  => cols.includes(c)),
        formatCol:  FORMAT_SYNS.find(c  => cols.includes(c)),
        team1Col:   TEAM1_SYNS.find(c  => cols.includes(c)),
        team2Col:   TEAM2_SYNS.find(c  => cols.includes(c)),
      }});
    }
  }
  return out;
}

function yClause() { return 'CAST(substr(date,1,4) AS INT) BETWEEN ? AND ?'; }

// ── Choropleth (home win %) ──────────────────────────────────────────────────

export async function computeChoropleth(yearMin, yearMax) {
  const tables = loadMatchTables();
  let rows = [];
  if (tables.length) {
    const key = cacheKey(yearMin, yearMax);
    const cached = choroCache.get(key);
    if (cached !== undefined) {
      rows = cached;
      if (DEBUG) console.info('[CHORO] cache hit', key);
    } else {
      try {
        const parts = tables.map(t => {
          const m = t.map;
          return `SELECT ${m.winnerCol} AS winner, ${m.hostCol} AS venue_country,
                         ${m.dateCol} AS date,
                         ${m.neutralCol ? `COALESCE(${m.neutralCol},0)` : '0'} AS neutral_venue,
                         ${m.resultCol  ? `COALESCE(${m.resultCol},'')` : "''"} AS result_type,
                         ${m.formatCol  ? `COALESCE(${m.formatCol},'')` : "''"} AS format
                  FROM ${t.name}`;
        });
        rows = DB.queryAll(`SELECT * FROM (${parts.join(' UNION ALL ')}) WHERE ${yClause()}`, [yearMin, yearMax]);
        choroCache.set(key, rows);
      } catch (e) {
        if (DEBUG) console.warn('[CHORO] Query failed:', e);
        rows = [];
      }
    }
  }

  const agg = aggregateChoropleth(rows, yearMin, yearMax, {
    canonicalMapName,
    canonicalTeamName,
    hostToHomeTeamCountry,
    normalizeFormat: Formats.normalizeFormat,
  });

  state.choroByCountry = agg;
  state.choroActive    = agg.size > 0;

  const maxMatches = d3.max(Array.from(agg.values()), d => {
    if (state.selectedFormat === 'all') return d.matches;
    return d.formats[state.selectedFormat] ? d.formats[state.selectedFormat].matches : 0;
  }) || 1;
  state.maxMatchesChoro = maxMatches;
  state.spikeScale.domain([0, maxMatches]).range([0, state.mode === 'globe' ? 56 : 40]);
  document.body.classList.toggle('choro-on', state.choroActive);
}

// ── Flows & bubbles ──────────────────────────────────────────────────────────

export async function computeFlows(yearMin, yearMax) {
  try {
    let rows = [];
    try {
      const tables = loadMatchTables();
      if (tables.length) {
        const key = cacheKey(yearMin, yearMax);
        const cached = flowsCache.get(key);
        if (cached !== undefined) {
          rows = cached;
          if (DEBUG) console.info('[FLOWS] cache hit', key);
        } else {
          const parts = tables.map(t => {
            const m = t.map;
            return `SELECT ${m.winnerCol} AS winner, ${m.hostCol} AS venue_country,
                           ${m.dateCol} AS date,
                           ${m.neutralCol ? `COALESCE(${m.neutralCol},0)` : '0'} AS neutral_venue,
                           ${m.resultCol  ? `COALESCE(${m.resultCol},'')` : "''"} AS result_type,
                           ${m.formatCol  ? `COALESCE(${m.formatCol},'')` : "''"} AS format,
                           ${m.team1Col   ? `COALESCE(${m.team1Col},'')` : "''"} AS team1,
                           ${m.team2Col   ? `COALESCE(${m.team2Col},'')` : "''"} AS team2
                    FROM ${t.name}`;
          });
          rows = DB.queryAll(`SELECT * FROM (${parts.join(' UNION ALL ')}) WHERE ${yClause()}`, [yearMin, yearMax]) || [];
          flowsCache.set(key, rows);
        }
      }
    } catch (e) {
      if (DEBUG) console.warn('computeFlows: DB query failed', e);
    }

    const pairs      = new Map();
    const hostTotals = new Map();
    for (const r of rows) {
      const y = +(String(r.date || '').slice(0, 4));
      if (!y || y < yearMin || y > yearMax) continue;
      if (String(r.neutral_venue || '0').trim() === '1') continue;
      const rt = String(r.result_type || '').toLowerCase();
      if (rt.includes('no result') || rt.includes('no_result') || rt.includes('tie') || rt.includes('tied')) continue;
      const hostRaw = r.venue_country; if (!hostRaw) continue;
      const hostKey = canonicalMapName(hostRaw);
      const t1 = canonicalTeamName(r.team1 || '');
      const t2 = canonicalTeamName(r.team2 || '');
      const homeTeam = canonicalTeamName(hostToHomeTeamCountry(hostKey));
      let visitor = null;
      if (t1 && t2) {
        if (t1 === homeTeam) visitor = t2;
        else if (t2 === homeTeam) visitor = t1;
        else visitor = t1;
      } else {
        visitor = (t1 || t2 || '').toLowerCase();
      }
      if (!visitor) continue;
      const originKey = canonicalMapName(visitor);
      const key = `${originKey}|${hostKey}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
      hostTotals.set(hostKey, (hostTotals.get(hostKey) || 0) + 1);
    }

    const countries = state.countries;
    const outFlows  = [];
    pairs.forEach((cnt, k) => {
      const [originKey, hostKey] = k.split('|');
      const oF = countries.find(f => canonicalMapName(f.properties?.name || '') === originKey);
      const hF = countries.find(f => canonicalMapName(f.properties?.name || '') === hostKey);
      if (!oF || !hF) return;
      const o = d3.geoCentroid(oF), h = d3.geoCentroid(hF);
      if (!o || !h || !isFinite(o[0]) || !isFinite(h[0])) return;
      outFlows.push({ originKey, hostKey, originLon: o[0], originLat: o[1], hostLon: h[0], hostLat: h[1], matches: cnt });
    });
    state.flowData = outFlows;

    const bOut = [];
    hostTotals.forEach((cnt, hostKey) => {
      const feat = countries.find(f => canonicalMapName(f.properties?.name || '') === hostKey);
      if (!feat) return;
      const c = d3.geoCentroid(feat);
      if (!c || !isFinite(c[0])) return;
      bOut.push({ key: hostKey, lon: c[0], lat: c[1], matches: cnt });
    });
    state.bubbleData = bOut;

    const maxM = d3.max(outFlows.concat(bOut), d => d.matches) || 1;
    state.flowWidthScale   = d3.scaleSqrt().domain([0, maxM]).range([0.6, 6]);
    state.bubbleRadiusScale = d3.scaleSqrt().domain([0, maxM]).range([2, 18]);

    const origins = Array.from(new Set(outFlows.map(d => d.originKey))).sort();
    state.countryColors = new Map();
    origins.forEach((k, i) => {
      state.countryColors.set(k, d3.interpolateRainbow(i / Math.max(1, origins.length)));
    });
  } catch (e) {
    if (DEBUG) console.warn('computeFlows failed', e);
    state.flowData = []; state.bubbleData = [];
  }
}

// ── Leaderboards ─────────────────────────────────────────────────────────────

export async function getBattingLeaderboard(minYear, maxYear, format = 'all', limit = 50) {
  try {
    const patterns = Formats.formatLikePatterns(format);
    const fmtCond  = patterns.length
      ? `AND (${patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ')})`
      : '';
    const rows = await DB.queryAll(`
      SELECT bi.batter AS player, bi.team,
             COUNT(DISTINCT bi.match_id) AS matches,
             SUM(CAST(bi.runs AS INT))   AS runs,
             SUM(CAST(bi.balls AS INT))  AS balls,
             SUM(CASE WHEN COALESCE(bi.out,'')<>'' THEN 1 ELSE 0 END) AS dismissals,
             SUM(CASE WHEN CAST(bi.runs AS INT) >= 100 THEN 1 ELSE 0 END) AS hundreds,
             SUM(CASE WHEN CAST(bi.runs AS INT) BETWEEN 50 AND 99 THEN 1 ELSE 0 END) AS fifties,
             MAX(CAST(bi.runs AS INT)) AS best
      FROM batting_innings bi
      LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id
      WHERE CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ? ${fmtCond}
      GROUP BY bi.batter, bi.team
      ORDER BY runs DESC
      LIMIT ${limit}
    `, [minYear, maxYear, ...patterns]);
    if (!rows) return null;
    return rows.map(r => ({
      player: r.player, team: r.team,
      matches: +r.matches || 0, runs: +r.runs || 0, balls: +r.balls || 0,
      sr:      r.balls ? +(100 * (r.runs / r.balls)).toFixed(1) : 0,
      avg:     r.dismissals ? +(r.runs / r.dismissals).toFixed(2) : (r.matches ? +(r.runs / r.matches).toFixed(2) : 0),
      hundreds: +r.hundreds || 0, fifties: +r.fifties || 0, best: r.best,
    }));
  } catch (e) {
    if (DEBUG) console.warn('batting leaderboard SQL failed', e);
    return null;
  }
}

export async function getBowlingLeaderboard(minYear, maxYear, format = 'all', limit = 50) {
  try {
    const patterns = Formats.formatLikePatterns(format);
    const fmtCond  = patterns.length
      ? `AND (${patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ')})`
      : '';
    const rows = await DB.queryAll(`
      SELECT bi.bowler AS player, bi.team,
             COUNT(DISTINCT bi.match_id) AS matches,
             SUM(CAST(bi.wickets AS INT))       AS wkts,
             SUM(CAST(bi.runs_conceded AS INT))  AS runs_conceded,
             SUM(CAST(bi.legal_balls AS INT))    AS balls,
             SUM(CASE WHEN CAST(bi.wickets AS INT) >= 5 THEN 1 ELSE 0 END) AS five_wkts,
             MAX(CAST(bi.wickets AS INT)) AS best_wkts
      FROM bowling_innings bi
      LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id
      WHERE CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ? ${fmtCond}
      GROUP BY bi.bowler, bi.team
      ORDER BY wkts DESC
      LIMIT ${limit}
    `, [minYear, maxYear, ...patterns]);
    if (!rows) return null;
    const out = [];
    for (const r of rows) {
      let bestRuns = 0;
      try {
        let br;
        if (fmtCond) {
          const fmtLike = patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ');
          br = await DB.queryAll(
            `SELECT MIN(CAST(bi.runs_conceded AS INT)) AS runs FROM bowling_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id WHERE (${fmtLike}) AND bi.bowler = ? AND CAST(bi.wickets AS INT) = ? LIMIT 1`,
            [...patterns, r.player, r.best_wkts]
          );
        } else {
          br = await DB.queryAll(
            `SELECT MIN(CAST(bi.runs_conceded AS INT)) AS runs FROM bowling_innings bi WHERE bi.bowler = ? AND CAST(bi.wickets AS INT) = ? LIMIT 1`,
            [r.player, r.best_wkts]
          );
        }
        if (br && br[0] && br[0].runs != null) bestRuns = +br[0].runs;
      } catch (e) { reportError('nonfatal', e); }
      out.push({
        player: r.player, team: r.team,
        matches: +r.matches || 0, wkts: +r.wkts || 0, runs_conceded: +r.runs_conceded || 0, balls: +r.balls || 0,
        eco:       r.balls  ? +((r.runs_conceded / (r.balls / 6))).toFixed(2) : 0,
        avg:       r.wkts   ? +(r.runs_conceded / r.wkts).toFixed(2) : 0,
        five_wkts: +r.five_wkts || 0,
        best: `${r.best_wkts || 0}/${bestRuns || 0}`,
      });
    }
    return out;
  } catch (e) {
    if (DEBUG) console.warn('bowling leaderboard SQL failed', e);
    return null;
  }
}

// ── Venue DB helpers ─────────────────────────────────────────────────────────

export async function loadVenueCountries() {
  try {
    const schema = await getVenueSchema();
    if (!schema || !schema.countryCol) return new Set();
    const rows = DB.queryAll(`SELECT DISTINCT ${schema.countryCol} AS country FROM venues WHERE ${schema.countryCol} IS NOT NULL`);
    const s = new Set();
    for (const r of rows) { if (r && r.country) s.add(canonicalMapName(r.country)); }
    return s;
  } catch (e) {
    if (DEBUG) console.warn('loadVenueCountries failed', e);
    return new Set();
  }
}

export async function loadVenuesForCountry(name) {
  try {
    const schema = await getVenueSchema();
    if (!schema || !schema.countryCol) return [];
    const rows = DB.queryAll(
      `SELECT * FROM venues WHERE LOWER(COALESCE(${schema.countryCol},'')) LIKE ?`,
      [`%${String(name).toLowerCase()}%`]
    ) || [];
    return rows.map(r => {
      const out = Object.assign({}, r);
      if (schema.lonCol && !out.longitude && Object.hasOwn(out, schema.lonCol)) out.longitude = out[schema.lonCol];
      if (schema.latCol && !out.latitude  && Object.hasOwn(out, schema.latCol))  out.latitude  = out[schema.latCol];
      return out;
    });
  } catch (e) {
    if (DEBUG) console.warn('loadVenuesForCountry failed', e);
    return [];
  }
}

// ── Player drill-down queries ────────────────────────────────────────────────

export async function getPlayerYearBatting(playerName, minYear, maxYear, format = 'all') { try { const patterns = Formats.formatLikePatterns(format); const fmtCond = patterns.length ? `AND (${patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ')})` : ''; const rows = DB.queryAll(`SELECT CAST(substr(m.date,1,4) AS INT) AS year, SUM(CAST(bi.runs AS INT)) AS runs, SUM(CAST(bi.balls AS INT)) AS balls, COUNT(DISTINCT bi.match_id) AS matches FROM batting_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id WHERE bi.batter = ? AND CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ? ${fmtCond} GROUP BY year ORDER BY year`, [playerName, minYear, maxYear, ...patterns]); return (rows || []).map(r => ({ year: +r.year, runs: +r.runs || 0, balls: +r.balls || 0, matches: +r.matches || 0, sr: r.balls ? +((100 * +r.runs / +r.balls).toFixed(1)) : 0, avg: r.matches ? +((+r.runs / +r.matches).toFixed(2)) : 0 })); } catch (_) { return []; } }
export async function getPlayerFormatBatting(playerName) { try { const rows = DB.queryAll(`SELECT LOWER(COALESCE(m.format, bi.format, '')) AS fmt, SUM(CAST(bi.runs AS INT)) AS runs FROM batting_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id WHERE bi.batter = ? GROUP BY fmt`, [playerName]); if (!rows || !rows.length) return []; const fmtMap = { test: 'Test', odi: 'ODI', t20: 'T20', t20i: 'T20', twenty20: 'T20', 't20 international': 'T20' }; const agg = new Map(); for (const r of rows) { const raw = String(r.fmt || '').trim(); if (!raw) continue; const label = fmtMap[raw] || (raw === 'odi' ? 'ODI' : raw === 'test' ? 'Test' : raw.includes('t20') ? 'T20' : null); if (!label) continue; agg.set(label, (agg.get(label) || 0) + (+r.runs || 0)); } const out = []; for (const [label, runs] of agg) out.push({ label, runs }); out.sort((a, b) => b.runs - a.runs); return out; } catch (_) { return []; } }
export async function getPlayerTopVenues(playerName, minYear, maxYear, format = 'all', limit = 5) {
  try {
    const patterns = Formats.formatLikePatterns(format);
    const fmtCond = patterns.length ? `AND (${patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ')})` : '';
    const rawRows = DB.queryAll(
      `SELECT COALESCE(m.venue_name, '') AS venue,
              SUM(CAST(bi.runs AS INT))       AS runs,
              COUNT(DISTINCT bi.match_id)     AS matches
       FROM batting_innings bi
       LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id
       WHERE bi.batter = ? AND CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ? ${fmtCond}
       GROUP BY COALESCE(m.venue_name, '')`,
      [playerName, minYear, maxYear, ...patterns]
    ) || [];
    const canon = getVenueCanonicalMap();
    const agg = new Map();
    for (const r of rawRows) {
      const key = canon.get(String(r.venue || '').toLowerCase().trim()) || r.venue || 'Unknown';
      const cur = agg.get(key) || { venue: key, runs: 0, matches: 0 };
      cur.runs    += +r.runs    || 0;
      cur.matches += +r.matches || 0;
      agg.set(key, cur);
    }
    return Array.from(agg.values()).sort((a, b) => b.runs - a.runs).slice(0, limit);
  } catch (_) { return []; }
}
export async function getPlayerYearBowling(playerName, minYear, maxYear, format = 'all') { try { const patterns = Formats.formatLikePatterns(format); const fmtCond = patterns.length ? `AND (${patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ')})` : ''; const rows = DB.queryAll(`SELECT CAST(substr(m.date,1,4) AS INT) AS year, SUM(CAST(bi.wickets AS INT)) AS wickets, SUM(CAST(bi.runs_conceded AS INT)) AS runs_conceded, SUM(CAST(bi.legal_balls AS INT)) AS balls, COUNT(DISTINCT bi.match_id) AS matches FROM bowling_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id WHERE bi.bowler = ? AND CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ? ${fmtCond} GROUP BY year ORDER BY year`, [playerName, minYear, maxYear, ...patterns]); return (rows || []).map(r => ({ year: +r.year, wickets: +r.wickets || 0, runs_conceded: +r.runs_conceded || 0, balls: +r.balls || 0, matches: +r.matches || 0, econ: r.balls ? +((+r.runs_conceded / (+r.balls / 6)).toFixed(2)) : 0 })); } catch (_) { return []; } }
export async function getPlayerFormatBowling(playerName) { try { const rows = DB.queryAll(`SELECT LOWER(COALESCE(m.format, bi.format, '')) AS fmt, SUM(CAST(bi.wickets AS INT)) AS wickets FROM bowling_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id WHERE bi.bowler = ? GROUP BY fmt`, [playerName]); if (!rows || !rows.length) return []; const fmtMap = { test: 'Test', odi: 'ODI', t20: 'T20', t20i: 'T20', twenty20: 'T20', 't20 international': 'T20' }; const agg = new Map(); for (const r of rows) { const raw = String(r.fmt || '').trim(); if (!raw) continue; const label = fmtMap[raw] || (raw === 'odi' ? 'ODI' : raw === 'test' ? 'Test' : raw.includes('t20') ? 'T20' : null); if (!label) continue; agg.set(label, (agg.get(label) || 0) + (+r.wickets || 0)); } const out = []; for (const [label, wickets] of agg) out.push({ label, wickets }); out.sort((a, b) => b.wickets - a.wickets); return out; } catch (_) { return []; } }
export async function getPlayerTopVenuesBowling(playerName, minYear, maxYear, format = 'all', limit = 5) {
  try {
    const patterns = Formats.formatLikePatterns(format);
    const fmtCond = patterns.length ? `AND (${patterns.map(() => `LOWER(COALESCE(m.format, bi.format, '')) LIKE ?`).join(' OR ')})` : '';
    const rawRows = DB.queryAll(
      `SELECT COALESCE(m.venue_name, '') AS venue,
              SUM(CAST(bi.wickets AS INT))    AS wickets,
              COUNT(DISTINCT bi.match_id)     AS matches
       FROM bowling_innings bi
       LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id
       WHERE bi.bowler = ? AND CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ? ${fmtCond}
       GROUP BY COALESCE(m.venue_name, '')`,
      [playerName, minYear, maxYear, ...patterns]
    ) || [];
    const canon = getVenueCanonicalMap();
    const agg = new Map();
    for (const r of rawRows) {
      const key = canon.get(String(r.venue || '').toLowerCase().trim()) || r.venue || 'Unknown';
      const cur = agg.get(key) || { venue: key, wickets: 0, matches: 0 };
      cur.wickets += +r.wickets || 0;
      cur.matches += +r.matches || 0;
      agg.set(key, cur);
    }
    return Array.from(agg.values()).sort((a, b) => b.wickets - a.wickets).slice(0, limit);
  } catch (_) { return []; }
}

// ── Head-to-head comparison queries (T-3.2) ───────────────────────────────────

// Build a "AND (LOWER(<col>) LIKE ? OR ...)" fragment for the given format key.
// Returns { sql, params }; sql is '' (no params) when format matches everything.
function buildFormatCond(format, col = 'm.format') {
  const patterns = Formats.formatLikePatterns(format);
  if (!patterns.length) return { sql: '', params: [] };
  const sql = `AND (${patterns.map(() => `LOWER(${col}) LIKE ?`).join(' OR ')})`;
  return { sql, params: patterns };
}

// Standard "either team1=A & team2=B, or swapped" clause + its params.
function pairingClause(teamA, teamB) {
  return {
    sql: '((m.team1 = ? AND m.team2 = ?) OR (m.team1 = ? AND m.team2 = ?))',
    params: [teamA, teamB, teamB, teamA],
  };
}

function yearBetween() { return 'CAST(substr(m.date,1,4) AS INT) BETWEEN ? AND ?'; }

export async function getHeadToHeadStats(teamA, teamB, minYear, maxYear, format = 'all') {
  const empty = { winsA: 0, winsB: 0, draws: 0, noResult: 0, total: 0 };
  try {
    const fmt = buildFormatCond(format);
    const pair = pairingClause(teamA, teamB);
    const rows = DB.queryAll(`
      SELECT m.winner, m.result_type, COUNT(*) AS total
      FROM ${matchView()} AS m
      WHERE ${yearBetween()} AND ${pair.sql} ${fmt.sql}
      GROUP BY m.winner, m.result_type
    `, [minYear, maxYear, ...pair.params, ...fmt.params]);
    if (!rows) return empty;

    let winsA = 0, winsB = 0, draws = 0, noResult = 0;
    for (const r of rows) {
      const winner = String(r.winner || '').trim();
      const rt = String(r.result_type || '').toLowerCase();
      const n = +r.total || 0;
      if (rt.includes('no result') || rt === 'abandoned')     noResult += n;
      else if (rt === 'draw' || rt === 'tie' || rt === 'tied') draws    += n;
      else if (winner === teamA)                               winsA    += n;
      else if (winner === teamB)                               winsB    += n;
      else                                                     draws    += n;
    }
    return { winsA, winsB, draws, noResult, total: winsA + winsB + draws + noResult };
  } catch (e) {
    if (DEBUG) console.warn('getHeadToHeadStats failed', e);
    return empty;
  }
}

// Biggest wins per team. Queried separately so one team's blowouts can't crowd
// out the other's. Sorted by a "dominance score" that mixes runs- and wickets-
// wins on the same axis: a 10-wicket chase beats a 30-run squeaker; a 400-run
// blowout still tops everything.
//   runs    -> score = margin               (0..~500)
//   wickets -> score = margin^2 * 4         (10w=400, 5w=100, 1w=4)
// (Limitation: the dataset doesn't tag "innings and N runs" wins separately —
// they're stored as result_type='runs', so we treat them as regular runs wins.)
export async function getHeadToHeadBiggestWins(teamA, teamB, minYear, maxYear, format = 'all') {
  const empty = { bestA: [], bestB: [] };
  try {
    const fmt = buildFormatCond(format);
    const pair = pairingClause(teamA, teamB);

    const fetchFor = (winner) => DB.queryAll(`
      SELECT m.winner, m.result_type, m.win_margin, m.date, m.venue_name
      FROM ${matchView()} AS m
      WHERE ${yearBetween()}
        AND ${pair.sql}
        AND m.winner = ?
        AND LOWER(COALESCE(m.result_type, '')) IN ('runs', 'wickets')
        AND m.win_margin IS NOT NULL AND m.win_margin <> ''
        ${fmt.sql}
    `, [minYear, maxYear, ...pair.params, winner, ...fmt.params]) || [];

    const toEntries = (rows) => rows
      .map(r => ({
        winner: r.winner,
        result: String(r.result_type || '').toLowerCase(),
        margin: +r.win_margin || 0,
        date:   r.date,
        venue:  r.venue_name,
      }))
      .sort((a, b) => dominanceScore(b) - dominanceScore(a))
      .slice(0, 3);

    return { bestA: toEntries(fetchFor(teamA)), bestB: toEntries(fetchFor(teamB)) };
  } catch (e) {
    if (DEBUG) console.warn('getHeadToHeadBiggestWins failed', e);
    return empty;
  }
}

function dominanceScore(win) {
  if (win.result === 'runs')    return win.margin;
  if (win.result === 'wickets') return win.margin * win.margin * 4;
  return 0;
}

export async function getHeadToHeadTopPlayers(teamA, teamB, minYear, maxYear, format = 'all') {
  const empty = { batters: [], bowlers: [] };
  try {
    const fmt = buildFormatCond(format, "COALESCE(m.format, bi.format, '')");
    const pair = pairingClause(teamA, teamB);
    const baseParams = [minYear, maxYear, ...pair.params, teamA, teamB, ...fmt.params];

    const topBatters = DB.queryAll(`
      SELECT bi.batter AS player, bi.team,
             SUM(CAST(bi.runs AS INT))    AS runs,
             COUNT(DISTINCT bi.match_id)  AS matches
      FROM batting_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id
      WHERE ${yearBetween()} AND ${pair.sql} AND bi.team IN (?, ?) ${fmt.sql}
      GROUP BY bi.batter, bi.team
      ORDER BY runs DESC LIMIT 10
    `, baseParams) || [];

    const topBowlers = DB.queryAll(`
      SELECT bi.bowler AS player, bi.team,
             SUM(CAST(bi.wickets AS INT)) AS wickets,
             COUNT(DISTINCT bi.match_id)  AS matches
      FROM bowling_innings bi LEFT JOIN ${matchView()} AS m ON bi.match_id = m.match_id
      WHERE ${yearBetween()} AND ${pair.sql} AND bi.team IN (?, ?) ${fmt.sql}
      GROUP BY bi.bowler, bi.team
      ORDER BY wickets DESC LIMIT 10
    `, baseParams) || [];

    return {
      batters: topBatters.map(r => ({ player: r.player, team: r.team, runs:    +r.runs    || 0, matches: +r.matches || 0 })),
      bowlers: topBowlers.map(r => ({ player: r.player, team: r.team, wickets: +r.wickets || 0, matches: +r.matches || 0 })),
    };
  } catch (e) {
    if (DEBUG) console.warn('getHeadToHeadTopPlayers failed', e);
    return empty;
  }
}

// ── Toss impact analysis (T-3.3) ─────────────────────────────────────────────

/**
 * Per-venue toss stats: for each format, count decided matches and
 * batting-first wins, with Wilson 95% CI.
 * @param {string[]} aliases - LIKE patterns for venue_name matching
 * @param {{min:number,max:number}} yrRange
 * @param {string} format - 'all' | 'test' | 'odi' | 't20'
 * @returns {Promise<{byFormat:{test:{decided, battingFirstWins, pct, lo, hi}, odi:{...}, t20:{...}}}>}
 */
export async function getVenueTossStats(aliases, yrRange, format = 'all') {
  await DB.init(window._DB_URL || './data/db/cricket.db');

  // Expand aliases via the DB's venues table to pick up historical names
  // (e.g. "sky stadium" → also "westpac stadium"). The venues table has a
  // `names` column with semicolon-separated historical names for each ground.
  const expandedSet = new Set((aliases || []).map(a => String(a).toLowerCase().trim()));
  try {
    if (expandedSet.size > 0) {
      const aliasArr = Array.from(expandedSet);
      const likeFrags = aliasArr.flatMap(() => [`LOWER(venue) LIKE ?`, `LOWER(names) LIKE ?`]).join(' OR ');
      const likeParams = aliasArr.flatMap(a => [`%${a}%`, `%${a}%`]);
      const venueRows = DB.queryAll(`SELECT names FROM venues WHERE ${likeFrags}`, likeParams) || [];
      for (const row of venueRows) {
        if (row.names) {
          String(row.names).split(';').map(n => n.trim().toLowerCase()).filter(Boolean)
            .forEach(n => expandedSet.add(n));
        }
      }
    }
  } catch (e) {
    if (DEBUG) console.warn('getVenueTossStats alias expansion failed', e);
  }

  const allAliases = Array.from(expandedSet);
  const likeExprs = allAliases.length
    ? allAliases.map(() => `LOWER(COALESCE(vsf.venue_name, '')) LIKE ?`).join(' OR ')
    : '1=0';

  const formats = ['test', 'odi', 't20'];
  const byFormat = {};

  for (const fmt of formats) {
    const fmtPatterns = Formats.formatLikePatterns(fmt);
    const fmtCond = fmtPatterns.length
      ? `AND (${fmtPatterns.map(() => `LOWER(COALESCE(vsf.format,'')) LIKE ?`).join(' OR ')})`
      : '';
    const params = [yrRange.min, yrRange.max, ...allAliases.map(a => `%${a}%`), ...fmtPatterns];

    let rows;
    try {
      // Use venue_stats_format which has first_bat_wins/matches_with_result pre-aggregated
      // and uses the same raw venue names as the matches table.
      rows = DB.queryAll(`
        SELECT SUM(vsf.matches_with_result) AS decided,
               SUM(vsf.first_bat_wins)      AS wins
        FROM venue_stats_format vsf
        WHERE vsf.year BETWEEN ? AND ?
          AND (${likeExprs})
          ${fmtCond}
      `, params) || [];
    } catch (e) {
      if (DEBUG) console.warn('getVenueTossStats query failed for', fmt, e);
      byFormat[fmt] = { decided: 0, battingFirstWins: 0, pct: null, lo: null, hi: null };
      continue;
    }

    const decided = Number(rows[0]?.decided || 0);
    const wins    = Number(rows[0]?.wins    || 0);
    const ci = wilsonInterval(wins, decided);
    byFormat[fmt] = { decided, battingFirstWins: wins, pct: ci.p, lo: ci.lo, hi: ci.hi };
  }

  return { byFormat };
}

/**
 * Global venue toss-bias ranking across all venues, sorted by Wilson CI lower bound.
 * @param {{min:number,max:number}} yrRange
 * @param {string} format - 'all' | 'test' | 'odi' | 't20'
 * @param {number} [minMatches=20]
 * @returns {Promise<{top10:Array, bottom10:Array, total:number}>}
 */
export async function getVenueTossBias(yrRange, format = 'all', minMatches = 20) {
  await DB.init(window._DB_URL || './data/db/cricket.db');

  const historicalToCanonical = getVenueCanonicalMap();

  const fmtPatterns = Formats.formatLikePatterns(format);
  const fmtCond = fmtPatterns.length
    ? `AND (${fmtPatterns.map(() => `LOWER(COALESCE(vsf.format,'')) LIKE ?`).join(' OR ')})`
    : '';

  let rawRows;
  try {
    const sql = `
      SELECT vsf.venue_name,
             SUM(vsf.first_bat_wins)      AS bf_wins,
             SUM(vsf.matches_with_result) AS total
      FROM venue_stats_format vsf
      WHERE vsf.year BETWEEN ? AND ?
        ${fmtCond}
      GROUP BY vsf.venue_name
    `;
    rawRows = DB.queryAll(sql, [yrRange.min, yrRange.max, ...fmtPatterns]) || [];
  } catch (e) {
    if (DEBUG) console.warn('getVenueTossBias failed', e);
    return { top10: [], bottom10: [], total: 0 };
  }

  // Re-aggregate by canonical name in JS
  const byCanonical = new Map();
  for (const r of rawRows) {
    const rawName  = String(r.venue_name || '').trim();
    const canonical = historicalToCanonical.get(rawName.toLowerCase()) || rawName;
    const existing = byCanonical.get(canonical) || { venue: canonical, bf_wins: 0, total: 0 };
    existing.bf_wins += Number(r.bf_wins || 0);
    existing.total   += Number(r.total   || 0);
    byCanonical.set(canonical, existing);
  }

  const enriched = [];
  for (const agg of byCanonical.values()) {
    if (agg.total < minMatches) continue;
    enriched.push({
      venue: agg.venue,
      wins:  agg.bf_wins,
      n:     agg.total,
      pct:   agg.total ? agg.bf_wins / agg.total : 0,
      ...wilsonInterval(agg.bf_wins, agg.total),
    });
  }

  // Sort by Wilson CI bounds, not raw %, so small-sample flukes don't dominate.
  // top10: highest reliable batting-first advantage → sort by lo (lower bound) desc.
  // bottom10: most reliably bowling-friendly → sort by hi (upper bound) asc.
  const top10    = enriched.slice().sort((a, b) => (b.lo ?? -1) - (a.lo ?? -1)).slice(0, 10);
  const bottom10 = enriched.slice().sort((a, b) => (a.hi ?? 2)  - (b.hi ?? 2) ).slice(0, 10);

  return { top10, bottom10, total: enriched.length };
}

// ── Search index queries ──────────────────────────────────────────────────────

export async function getAllSearchVenues() {
  await DB.init(window._DB_URL || './data/db/cricket.db');
  const schema = await getVenueSchema();
  if (!schema) return [];
  try {
    const latCol  = schema.latCol  || 'latitude';
    const lonCol  = schema.lonCol  || 'longitude';
    const ctyCol  = schema.countryCol || 'country';
    const rows = DB.queryAll(
      `SELECT venue,
              COALESCE(city, '') AS city,
              COALESCE(${ctyCol}, '') AS country,
              ${latCol}  AS latitude,
              ${lonCol}  AS longitude
       FROM venues
       WHERE ${latCol} IS NOT NULL AND ${lonCol} IS NOT NULL
       ORDER BY venue`
    ) || [];
    return rows.map(r => ({
      venue:     String(r.venue     || '').trim(),
      city:      String(r.city      || '').trim(),
      country:   String(r.country   || '').trim(),
      latitude:  +r.latitude,
      longitude: +r.longitude,
    })).filter(r => r.venue && isFinite(r.latitude) && isFinite(r.longitude));
  } catch (e) {
    if (DEBUG) console.warn('getAllSearchVenues failed', e);
    return [];
  }
}

export async function getAllSearchPlayers() {
  await DB.init(window._DB_URL || './data/db/cricket.db');
  try {
    const batters = DB.queryAll(
      `SELECT batter AS name, team, 'batting' AS kind
       FROM batting_innings
       GROUP BY batter, team
       HAVING COUNT(*) >= 5
       ORDER BY name`
    ) || [];
    const bowlers = DB.queryAll(
      `SELECT bowler AS name, team, 'bowling' AS kind
       FROM bowling_innings
       GROUP BY bowler, team
       HAVING COUNT(*) >= 5
       ORDER BY name`
    ) || [];
    // Deduplicate: keep batting entry if player appears in both
    const seen = new Set();
    const out = [];
    for (const r of [...batters, ...bowlers]) {
      const key = String(r.name || '').trim().toLowerCase();
      if (!key || seen.has(key + r.kind)) continue;
      seen.add(key + r.kind);
      out.push({ name: String(r.name).trim(), team: String(r.team || '').trim(), kind: r.kind });
    }
    return out;
  } catch (e) {
    if (DEBUG) console.warn('getAllSearchPlayers failed', e);
    return [];
  }
}
