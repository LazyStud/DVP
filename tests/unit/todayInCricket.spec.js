// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/data/queries.js', () => ({ matchView: () => 'matches' }));
vi.mock('../../src/db.js', () => ({
  DB: { queryAll: vi.fn() },
}));

import { initTodayInCricket } from '../../src/ui/todayInCricket.js';
import { DB } from '../../src/db.js';

const BASE_ROW = {
  date: '2015-06-15',
  format: 'ODI',
  team1: 'India',
  team2: 'Pakistan',
  city: 'Manchester',
  venue_name: 'Old Trafford',
  winner: 'India',
  result_type: 'runs',
  win_margin: '89',
  player_of_match: 'Virat Kohli',
};

function mount() {
  document.body.innerHTML = '<div id="todayHook"></div>';
  return document.getElementById('todayHook');
}

describe('initTodayInCricket', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns early when #todayHook is absent', () => {
    document.body.innerHTML = '';
    DB.queryAll.mockReturnValue([BASE_ROW]);
    expect(() => initTodayInCricket()).not.toThrow();
  });

  it('returns early when DB throws', () => {
    mount();
    DB.queryAll.mockImplementation(() => { throw new Error('no db'); });
    expect(() => initTodayInCricket()).not.toThrow();
    expect(document.getElementById('todayHook').children).toHaveLength(0);
  });

  it('returns early when DB returns no rows', () => {
    mount();
    DB.queryAll.mockReturnValue([]);
    initTodayInCricket();
    expect(document.getElementById('todayHook').children).toHaveLength(0);
  });

  it('renders winner and loser in the card', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW]);
    initTodayInCricket();
    expect(el.querySelector('strong').textContent).toBe('India');
    expect(el.textContent).toContain('Pakistan');
  });

  it('renders margin text for a run win', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW]);
    initTodayInCricket();
    expect(el.querySelector('.today-margin').textContent).toBe('by 89 runs');
  });

  it('renders "by 1 run" (singular) correctly', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([{ ...BASE_ROW, win_margin: '1', result_type: 'runs' }]);
    initTodayInCricket();
    expect(el.querySelector('.today-margin').textContent).toBe('by 1 run');
  });

  it('renders margin text for a wicket win', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([{ ...BASE_ROW, result_type: 'wickets', win_margin: '5' }]);
    initTodayInCricket();
    expect(el.querySelector('.today-margin').textContent).toBe('by 5 wickets');
  });

  it('renders innings margin with run count', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([{ ...BASE_ROW, result_type: 'innings', win_margin: '42' }]);
    initTodayInCricket();
    expect(el.querySelector('.today-margin').textContent).toBe('by an innings & 42 runs');
  });

  it('renders innings without run count when margin is 0', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([{ ...BASE_ROW, result_type: 'innings', win_margin: '0' }]);
    initTodayInCricket();
    expect(el.querySelector('.today-margin').textContent).toBe('by an innings');
  });

  it('omits margin element when result_type is unknown and margin is 0', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([{ ...BASE_ROW, result_type: 'tie', win_margin: '0' }]);
    initTodayInCricket();
    expect(el.querySelector('.today-margin')).toBeNull();
  });

  it('renders player of match', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW]);
    initTodayInCricket();
    expect(el.querySelector('.today-pom').textContent).toBe('Virat Kohli');
  });

  it('omits player-of-match element when field is absent', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([{ ...BASE_ROW, player_of_match: null }]);
    initTodayInCricket();
    expect(el.querySelector('.today-pom')).toBeNull();
  });

  it('shows navigation counter when multiple matches returned', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW, { ...BASE_ROW, winner: 'Pakistan' }]);
    initTodayInCricket();
    expect(el.querySelector('.today-count').textContent).toBe('1 / 2');
  });

  it('does not show nav when only one match', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW]);
    initTodayInCricket();
    expect(el.querySelector('.today-nav')).toBeNull();
  });

  it('meta line contains format, year and city', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW]);
    initTodayInCricket();
    const meta = el.querySelector('.today-meta').textContent;
    expect(meta).toContain('ODI');
    expect(meta).toContain('2015');
    expect(meta).toContain('Manchester');
  });

  it('marks the card as visible after render', () => {
    const el = mount();
    DB.queryAll.mockReturnValue([BASE_ROW]);
    initTodayInCricket();
    expect(el.classList.contains('visible')).toBe(true);
  });
});
