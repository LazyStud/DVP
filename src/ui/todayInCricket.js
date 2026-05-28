function marginText(resultType, margin) {
  const n = parseInt(margin, 10);
  if (!n && resultType !== 'innings') return null;
  if (resultType === 'innings') return `by an innings${n ? ` & ${n} run${n !== 1 ? 's' : ''}` : ''}`;
  if (resultType === 'runs')    return `by ${n} run${n !== 1 ? 's' : ''}`;
  if (resultType === 'wickets') return `by ${n} wicket${n !== 1 ? 's' : ''}`;
  return null;
}

function buildCard(el, m, idx, total) {
  const loser = m.winner === m.team1 ? m.team2 : m.team1;
  const year  = m.date?.slice(0, 4) ?? '';
  const place = m.city || m.venue_name || '';
  const fmt   = m.format ?? '';

  el.innerHTML = '';

  // Meta: format · year · venue
  const meta = document.createElement('span');
  meta.className = 'today-meta';
  meta.textContent = [fmt, year, place].filter(Boolean).join('  ·  ');
  el.appendChild(meta);

  // Headline: Winner (accent) beat Loser
  const hl = document.createElement('div');
  hl.className = 'today-headline';
  const w = document.createElement('strong');
  w.textContent = m.winner;
  hl.appendChild(w);
  hl.appendChild(document.createTextNode(` beat ${loser}`));
  el.appendChild(hl);

  // Win margin
  const mg = marginText(m.result_type, m.win_margin);
  if (mg) {
    const mgEl = document.createElement('div');
    mgEl.className = 'today-margin';
    mgEl.textContent = mg;
    el.appendChild(mgEl);
  }

  // Player of match
  if (m.player_of_match) {
    const pom = document.createElement('div');
    pom.className = 'today-pom';
    pom.textContent = m.player_of_match;
    el.appendChild(pom);
  }

  // Navigation counter + next button
  if (total > 1) {
    const nav = document.createElement('div');
    nav.className = 'today-nav';
    const count = document.createElement('span');
    count.className = 'today-count';
    count.textContent = `${idx + 1} / ${total}`;
    nav.appendChild(count);
    el.appendChild(nav);
  }
}

export function initTodayInCricket() {
  const el = document.getElementById('todayHook');
  if (!el) return;

  const today = new Date();
  const mmdd  = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  let rows;
  try {
    rows = DB.queryAll(
      `SELECT date, format, team1, team2, city, venue_name,
              winner, result_type, win_margin, player_of_match
       FROM matches
       WHERE strftime('%m-%d', date) = ?
         AND winner IS NOT NULL AND winner != ''
       ORDER BY
         CASE
           WHEN result_type = 'wickets' AND CAST(win_margin AS INTEGER) <= 2 THEN 0
           WHEN result_type = 'runs'    AND CAST(win_margin AS INTEGER) <= 8 THEN 0
           WHEN result_type = 'innings' THEN 1
           ELSE 2
         END,
         RANDOM()
       LIMIT 5`,
      [mmdd]
    );
  } catch (_) { return; }

  if (!rows?.length) return;

  let idx = 0;

  function show(i) {
    buildCard(el, rows[i], i, rows.length);
    if (rows.length > 1) {
      const nav = el.querySelector('.today-nav');
      if (nav) {
        const btn = document.createElement('button');
        btn.className = 'today-next-btn';
        btn.textContent = 'next match';
        btn.addEventListener('click', () => {
          idx = (idx + 1) % rows.length;
          el.classList.remove('visible');
          setTimeout(() => { show(idx); el.classList.add('visible'); }, 280);
        });
        nav.appendChild(btn);
      }
    }
    el.classList.add('visible');
  }

  show(idx);
}
