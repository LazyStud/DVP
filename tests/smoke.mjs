/**
 * Smoke test — drives a real Chromium browser against the Vite dev server.
 *
 * Prerequisites:
 *   npm run dev          (server must be running on port 5173 or 5174)
 *   npx playwright install chromium   (one-time browser download)
 *
 * Run:
 *   node tests/smoke.mjs
 *   node tests/smoke.mjs --url http://localhost:5174   (custom port)
 */

import { chromium } from 'playwright';

const BASE = process.argv.find(a => a.startsWith('http')) ?? 'http://localhost:5173';
const PASS = '\x1b[32m✅\x1b[0m';
const FAIL = '\x1b[31m❌\x1b[0m';
const WARN = '\x1b[33m⚠️ \x1b[0m';

let failures = 0;

function ok(label, value) {
  if (value) {
    console.log(`  ${PASS} ${label}`);
  } else {
    console.log(`  ${FAIL} ${label}`);
    failures++;
  }
}

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const consoleErrors = [];
page.on('console',   msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push(`PAGEERROR: ${err.message}`));

console.log(`\nSmoke test → ${BASE}\n`);

// ── 1. Landing page ──────────────────────────────────────────────────────────
console.log('1. Landing page');
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

ok('hero section visible',         await page.locator('.hero').isVisible());
ok('globe element present',        await page.locator('#globe').isVisible());
ok('SVG rendered inside #globe',   await page.locator('#globe svg').count() > 0);
ok('SVG has children (drawing)',   await page.locator('#globe svg *').count() > 10);

// ── 2. Enter button transition ───────────────────────────────────────────────
console.log('\n2. "Explore data" transition');
await page.locator('#enterBtn').click();
// transitionend may not fire in headless; fallback fires at DUR+200=900ms —
// poll until both landing classes are gone (up to 2s) instead of a fixed 800ms wait.
await page.waitForFunction(
  () => !document.body.classList.contains('landing') && !document.body.classList.contains('landing-exit'),
  { timeout: 2000 }
).catch(() => {});

const isLandingGone = await page.evaluate(
  () => !document.body.classList.contains('landing') && !document.body.classList.contains('landing-exit')
);
ok('body class changed from "landing"', isLandingGone);
ok('globe still visible after transition', await page.locator('#globe').isVisible());

// ── 3. Choropleth + spikes render ────────────────────────────────────────────
console.log('\n3. Choropleth / spikes');
await page.waitForTimeout(3500);   // DB init + draw

// Spikes are rendered by deck.gl onto a <canvas> in globe mode — no SVG lines.
const deckCanvases = await page.locator('#globe canvas').count();
const paths        = await page.locator('#globe svg path').count();
const hasVenue     = await page.locator('#globe svg path.has-venues').count();

ok(`deck.gl canvas present (spikes via deck.gl, got ${deckCanvases})`, deckCanvases > 0);
ok(`country <path> elements rendered (got ${paths})`,  paths  > 10);
ok(`has-venues countries present (got ${hasVenue})`,   hasVenue > 0);

// ── 4. Year slider ───────────────────────────────────────────────────────────
console.log('\n4. Year slider');
ok('year box visible', await page.locator('#yearBox').isVisible());

const thumb = page.locator('.yr-thumb.left');
const tBox  = await thumb.boundingBox();
if (tBox) {
  await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tBox.x + 60, tBox.y + tBox.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(400);
}
const yearLabel = await page.locator('#yearBoxValue').textContent();
ok(`label updated after drag (got "${yearLabel}")`, yearLabel !== 'Years 2000–2025');

// ── 5. Country click → venue window ─────────────────────────────────────────
console.log('\n5. Country click → venues');
const venuePaths = page.locator('#globe svg path.country.has-venues');
const vpCount    = await venuePaths.count();
let clickedCountry = false;

for (let i = 0; i < Math.min(vpCount, 40); i++) {
  const box = await venuePaths.nth(i).boundingBox();
  if (box && box.x > 0 && box.y > 0 && box.width > 2 && box.height > 2) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    clickedCountry = true;
    break;
  }
}

await page.waitForTimeout(2500);
const venueWindowPresent = await page.evaluate(() => !!document.getElementById('venue-window'));
ok('clicked a has-venues country',    clickedCountry);
ok('#venue-window created in DOM',    venueWindowPresent);

// ── 6. Leaderboard overlay ───────────────────────────────────────────────────
console.log('\n6. Leaderboard overlay');
// Dismiss venue window first — it sits at z-index var(--z-popup)=150, above the
// overlay at var(--z-overlay)=100, which would intercept close-button clicks.
try {
  const venueClose = page.locator('#venue-window .venue-close');
  if (await venueClose.isVisible({ timeout: 300 })) {
    await venueClose.click();
    await page.waitForTimeout(300);
  }
} catch (_) { /* venue window already closed */ }
await page.locator('#menuBtn').click();
await page.waitForTimeout(600);

const overlayVisible = await page.locator('#leaderboardOverlay').isVisible();
ok('overlay opens on menuBtn click', overlayVisible);

if (overlayVisible) {
  const rows = await page.locator('#tabpanel tr').count();
  ok(`leaderboard table has rows (got ${rows})`, rows > 0);

  await page.locator('#tab-bowling').click();
  await page.waitForTimeout(400);
  const bowlingRows = await page.locator('#tabpanel tr').count();
  ok(`bowling tab has rows (got ${bowlingRows})`, bowlingRows > 0);

  await page.locator('#closeOverlay').click({ force: true });
  await page.waitForTimeout(400);  // 180 ms animation + buffer
  const overlayClosed = await page.evaluate(() => document.getElementById('leaderboardOverlay')?.hidden === true);
  ok('overlay closes', overlayClosed);
}

// ── 7. Console errors ────────────────────────────────────────────────────────
console.log('\n7. Console errors');
if (consoleErrors.length === 0) {
  console.log(`  ${PASS} No console errors`);
} else {
  consoleErrors.forEach(e => console.log(`  ${WARN} ${e}`));
  failures++;
}

// ── Result ───────────────────────────────────────────────────────────────────
await browser.close();
console.log('\n' + '─'.repeat(50));
if (failures === 0) {
  console.log(`${PASS} All checks passed`);
} else {
  console.log(`${FAIL} ${failures} check(s) failed`);
  process.exit(1);
}
