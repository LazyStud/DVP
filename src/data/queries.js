/* DB queries — pure data computation, no draw calls.
 * After calling compute*, callers in main.js trigger the draw functions.
 * Accesses globals: DB (db.js), Formats (formats.js), d3 (CDN).
 */
import { DEBUG }                          from '../debug.js';
import { state }                          from '../state.js';
import {
  canonicalMapName, canonicalTeamName, hostToHomeTeamCountry,
  WINNER_SYNS, DATE_SYNS, HOST_SYNS, NEUTRAL_SYNS, RESULT_SYNS, FORMAT_SYNS,
} from './names.js';
import { aggregateChoropleth } from './choropleth.js';

// ── Schema cache ─────────────────────────────────────────────────────────────

let schemaCache = null;

export async function getVenueSchema() {
  if (schemaCache) return schemaCache;
  await DB.init(window._DB_URL || './data/db/cricket.db');
  try { DB.queryAll("SELECT name FROM sqlite_master WHERE type='table'"); } catch (_) {}
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
    } catch (e) {
      if (DEBUG) console.warn('[CHORO] Query failed:', e);
      rows = [];
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
        const parts = tables.map(t => {
          const m = t.map;
          return `SELECT ${m.winnerCol} AS winner, ${m.hostCol} AS venue_country,
                         ${m.dateCol} AS date,
                         ${m.neutralCol ? `COALESCE(${m.neutralCol},0)` : '0'} AS neutral_venue,
                         ${m.resultCol  ? `COALESCE(${m.resultCol},'')` : "''"} AS result_type,
                         ${m.formatCol  ? `COALESCE(${m.formatCol},'')` : "''"} AS format,
                         NULL AS team1, NULL AS team2
                  FROM ${t.name}`;
        });
        rows = DB.queryAll(`SELECT * FROM (${parts.join(' UNION ALL ')}) WHERE ${yClause()}`, [yearMin, yearMax]) || [];
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
      LEFT JOIN matches m ON bi.match_id = m.match_id
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
      LEFT JOIN matches m ON bi.match_id = m.match_id
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
            `SELECT MIN(CAST(bi.runs_conceded AS INT)) AS runs FROM bowling_innings bi LEFT JOIN matches m ON bi.match_id = m.match_id WHERE (${fmtLike}) AND bi.bowler = ? AND CAST(bi.wickets AS INT) = ? LIMIT 1`,
            [...patterns, r.player, r.best_wkts]
          );
        } else {
          br = await DB.queryAll(
            `SELECT MIN(CAST(bi.runs_conceded AS INT)) AS runs FROM bowling_innings bi WHERE bi.bowler = ? AND CAST(bi.wickets AS INT) = ? LIMIT 1`,
            [r.player, r.best_wkts]
          );
        }
        if (br && br[0] && br[0].runs != null) bestRuns = +br[0].runs;
      } catch (_) {}
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
