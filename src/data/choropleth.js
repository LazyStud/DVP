/* Pure choropleth aggregation — no DOM, no globals, fully testable.
 * computeChoropleth in queries.js fetches rows from DB then delegates here.
 */

/**
 * Aggregate raw match rows into per-country win-rate records.
 *
 * @param {object[]} rows - flat match rows (venue_country, winner, date, neutral_venue, result_type, format)
 * @param {number}   yearMin
 * @param {number}   yearMax
 * @param {object}   fns - { canonicalMapName, canonicalTeamName, hostToHomeTeamCountry, normalizeFormat }
 * @returns {Map<string, object>} country key → { matches, homeWins, winPct, formats }
 */
export function aggregateChoropleth(rows, yearMin, yearMax, { canonicalMapName, canonicalTeamName, hostToHomeTeamCountry, normalizeFormat }) {
  const agg = new Map();

  function ensureRec(key) {
    if (!agg.has(key)) {
      agg.set(key, {
        matches: 0, homeWins: 0,
        byYear: {},
        formats: {
          all:  { matches: 0, homeWins: 0 },
          odi:  { matches: 0, homeWins: 0 },
          t20:  { matches: 0, homeWins: 0 },
          test: { matches: 0, homeWins: 0 },
        },
      });
    }
    return agg.get(key);
  }

  for (const r of rows) {
    const y = +(String(r.date).slice(0, 4));
    if (!y || y < yearMin || y > yearMax) continue;
    if (!r.venue_country) continue;
    if (String(r.neutral_venue ?? '0').trim() === '1') continue;

    const rt = String(r.result_type || '').toLowerCase().replace('_', ' ');
    if (rt === 'no result' || rt === 'tie' || rt === 'tied') continue;

    const hostKey  = canonicalMapName(r.venue_country);
    const homeTeam = canonicalTeamName(hostToHomeTeamCountry(hostKey));
    const win      = canonicalTeamName(r.winner || '') === homeTeam;

    const rec = ensureRec(hostKey);
    rec.matches += 1;
    rec.byYear[y] = (rec.byYear[y] || 0) + 1;
    if (win) rec.homeWins += 1;

    const fmt = normalizeFormat(r.format);
    if (fmt !== 'all' && rec.formats[fmt]) {
      rec.formats[fmt].matches += 1;
      if (win) rec.formats[fmt].homeWins += 1;
    }
  }

  agg.forEach(v => {
    v.winPct = v.matches ? v.homeWins / v.matches : 0;
    for (const k of Object.keys(v.formats)) {
      const f = v.formats[k];
      f.winPct = f.matches ? f.homeWins / f.matches : 0;
    }
  });

  return agg;
}
