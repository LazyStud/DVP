/* Canonical name helpers and column-synonym lists shared by queries + layers. */

// ── Country-name normalisation ───────────────────────────────────────────────

const ALIAS_TO_CANON = new Map([
  ['united states of america', 'united states'],
  ['usa',                       'united states'],
  ['uk',                        'united kingdom'],
  ['england',                   'united kingdom'],
  ['uae',                       'united arab emirates'],
]);

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalMapName(s) {
  const n = norm(s);
  return ALIAS_TO_CANON.get(n) || n;
}

// ── Team-name normalisation ──────────────────────────────────────────────────

const CARIB = new Set([
  'barbados', 'trinidad and tobago', 'jamaica', 'saint lucia', 'grenada',
  'antigua and barbuda', 'saint kitts and nevis', 'guyana', 'dominica',
  'saint vincent and the grenadines',
]);

const TEAM_ALIASES = new Map([
  ['uae',                       'united arab emirates'],
  ['united arab emirates',      'united arab emirates'],
  ['eng',                       'england'],
  ['uk',                        'england'],
  ['united kingdom',            'england'],
  ['usa',                       'united states'],
  ['united states of america',  'united states'],
  ['westindies',                'west indies'],
  ['west indies',               'west indies'],
]);

export function canonicalTeamName(s) {
  const n = norm(s);
  return TEAM_ALIASES.get(n) || n;
}

export function hostToHomeTeamCountry(host) {
  const h = norm(host);
  if (CARIB.has(h)) return 'west indies';
  if (h === 'united kingdom') return 'england';
  return h;
}

// ── Column-synonym lists (all lowercase) ────────────────────────────────────

export const WINNER_SYNS  = ['winner', 'match_winner', 'winning_team', 'win_team'];
export const DATE_SYNS    = ['date', 'match_date', 'start_date', 'starttime', 'start_time'];
export const HOST_SYNS    = ['venue_country', 'host_country', 'host', 'country', 'home_country', 'venuecountry'];
export const NEUTRAL_SYNS = ['neutral_venue', 'neutral', 'neutralground'];
export const RESULT_SYNS  = ['result_type', 'result', 'outcome_type'];
export const FORMAT_SYNS  = ['format', 'match_type', 'type', 'game_type', 'format_type'];
export const TEAM1_SYNS   = ['team1', 'home_team', 'team_1', 'team_home'];
export const TEAM2_SYNS   = ['team2', 'away_team', 'team_2', 'team_away', 'visiting_team'];
