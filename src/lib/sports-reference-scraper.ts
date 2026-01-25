/**
 * Sports-Reference.com Scraper
 * Clean, simple HTML pages for standings
 *
 * URLs:
 * - NBA: https://www.basketball-reference.com/leagues/NBA_2026_standings.html
 * - NFL: https://www.pro-football-reference.com/years/2025/#all_AFC, #all_NFC
 * - MLB: https://www.baseball-reference.com/leagues/majors/2025-standings.shtml
 * - Soccer: https://fbref.com/en/comps/1/schedule/World-Cup-Scores-and-Fixtures
 */

import { chromium } from 'playwright';

export interface Standing {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  wins: number;
  losses: number;
  ties?: number;
  points?: number;
}

/**
 * Team mappings for our database
 */
const TEAM_MAP: Record<string, string> = {
  'ATL': 'nba26-atl', 'BOS': 'nba26-bos', 'BKN': 'nba26-bkn', 'CHA': 'nba26-cha',
  'CHI': 'nba26-chi', 'CLE': 'nba26-cle', 'DAL': 'nba26-dal', 'DEN': 'nba26-den',
  'DET': 'nba26-det', 'GS': 'nba26-gs', 'HOU': 'nba26-hou', 'IND': 'nba26-ind',
  'LAC': 'nba26-lac', 'LAL': 'nba26-lal', 'MEM': 'nba26-mem', 'MIA': 'nba26-mia',
  'MIL': 'nba26-mil', 'MIN': 'nba26-min', 'NO': 'nba26-no', 'NYK': 'nba26-nyk',
  'OKC': 'nba26-okc', 'ORL': 'nba26-orl', 'PHI': 'nba26-phi', 'PHX': 'nba26-phx',
  'POR': 'nba26-por', 'SA': 'nba26-sa', 'SAC': 'nba26-sac', 'TOR': 'nba26-tor',
  'UTAH': 'nba26-utah', 'WSH': 'nba26-wsh',
};

/**
 * Scrape NBA standings from basketball-reference.com
 */
export async function scrapeNBAStandings(): Promise<Standing[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.basketball-reference.com/leagues/NBA_2026_standings.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const standings = await page.evaluate(() => {
      const results: Standing[] = [];

      // Find the standings table
      const tables = document.querySelectorAll('table[id*="standings"]');

      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
          // Skip header rows
          if (row.classList.contains('thead') || row.classList.contains('stat_header')) return;

          const cells = row.querySelectorAll('td');
          if (cells.length < 3) return;

          // Team name is usually in first column with data-stat="team_name"
          const teamCell = row.querySelector('[data-stat="team_name"] a, [data-stat="franchise"] a');
          if (!teamCell) return;

          const teamName = teamCell.textContent?.trim() || '';

          // Find abbreviation from team URL or cell
          const abbrMatch = row.textContent?.match(/\b([A-Z]{3})\b/);
          const abbr = abbrMatch ? abbrMatch[1] : teamName.substring(0, 3).toUpperCase();

          // Get wins and losses
          const winsCell = row.querySelector('[data-stat="wins"]');
          const lossesCell = row.querySelector('[data-stat="losses"]');

          if (winsCell && lossesCell) {
            const wins = parseInt(winsCell.textContent || '0', 10);
            const losses = parseInt(lossesCell.textContent || '0', 10);

            if (!isNaN(wins) && !isNaN(losses)) {
              results.push({
                teamId: abbr,
                teamName,
                teamAbbr: abbr,
                wins,
                losses,
              });
            }
          }
        });
      });

      return results;
    });

    await browser.close();
    return standings;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * Scrape NFL standings from pro-football-reference.com
 */
export async function scrapeNFLStandings(): Promise<Standing[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Scrape both AFC and NFC
    const standings: Standing[] = [];

    for (const conference of ['AFC', 'NFC']) {
      await page.goto(`https://www.pro-football-reference.com/years/2025/#all_${conference}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(2000);

      const confStandings = await page.evaluate((conf) => {
        const results: Standing[] = [];

        // Find the conference table
        const tableId = `all_${conf}`;
        const table = document.querySelector(`#${tableId} table`) || document.querySelector(`table[id*="${conf}"]`);

        if (table) {
          const rows = table.querySelectorAll('tbody tr');

          rows.forEach(row => {
            if (row.classList.contains('thead') || row.classList.contains('stat_header')) return;

            const teamCell = row.querySelector('[data-stat="team"] a');
            if (!teamCell) return;

            const teamName = teamCell.textContent?.trim() || '';
            const abbr = teamName.substring(0, 3).toUpperCase();

            const winsCell = row.querySelector('[data-stat="wins"]');
            const lossesCell = row.querySelector('[data-stat="losses"]');
            const tiesCell = row.querySelector('[data-stat="ties"]');

            if (winsCell && lossesCell) {
              const wins = parseInt(winsCell.textContent || '0', 10);
              const losses = parseInt(lossesCell.textContent || '0', 10);
              const ties = tiesCell ? parseInt(tiesCell.textContent || '0', 10) : 0;

              results.push({
                teamId: abbr,
                teamName,
                teamAbbr: abbr,
                wins,
                losses,
                ties,
              });
            }
          });
        }

        return results;
      }, conference);

      standings.push(...confStandings);
    }

    await browser.close();
    return standings;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * Scrape MLB standings from baseball-reference.com
 */
export async function scrapeMLBStandings(): Promise<Standing[]> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.baseball-reference.com/leagues/majors/2025-standings.shtml', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    const standings = await page.evaluate(() => {
      const results: Standing[] = [];

      const tables = document.querySelectorAll('table[id*="standings"]');

      tables.forEach(table => {
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
          if (row.classList.contains('thead') || row.classList.contains('stat_header')) return;

          const teamCell = row.querySelector('[data-stat="team_name"] a');
          if (!teamCell) return;

          const teamName = teamCell.textContent?.trim() || '';
          const abbr = teamName.substring(0, 3).toUpperCase();

          const winsCell = row.querySelector('[data-stat="wins"]');
          const lossesCell = row.querySelector('[data-stat="losses"]');

          if (winsCell && lossesCell) {
            const wins = parseInt(winsCell.textContent || '0', 10);
            const losses = parseInt(lossesCell.textContent || '0', 10);

            results.push({
              teamId: abbr,
              teamName,
              teamAbbr: abbr,
              wins,
              losses,
            });
          }
        });
      });

      return results;
    });

    await browser.close();
    return standings;

  } catch (error) {
    await browser.close();
    throw error;
  }
}

/**
 * Sync scraped standings to D1 database
 */
export async function syncScrapedStandings(
  db: import('@cloudflare/workers-types').D1Database,
  standings: Standing[],
  eventId: string,
  sport: string
): Promise<{ synced: number; source: string }> {
  let synced = 0;

  for (const standing of standings) {
    const stmt = db.prepare(`
      INSERT INTO espn_standings (id, event_id, sport, team_id, team_name, team_abbr, wins, losses, sync_source, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, team_id) DO UPDATE SET
        team_name = excluded.team_name,
        team_abbr = excluded.team_abbr,
        wins = excluded.wins,
        losses = excluded.losses,
        sync_source = excluded.sync_source,
        synced_at = excluded.synced_at
    `);

    await stmt
      .bind(
        `${eventId}-${standing.teamId}`,
        eventId,
        sport,
        standing.teamId,
        standing.teamName,
        standing.teamAbbr,
        standing.wins,
        standing.losses,
        'sports-reference-scrape',
        Math.floor(Date.now() / 1000)
      )
      .run();

    synced++;
  }

  return { synced, source: 'sports-reference-scrape' };
}

/**
 * Quick test function
 */
export async function testNBA() {
  const results = await scrapeNBAStandings();
  console.log(`Found ${results.length} teams`);
  const okc = results.find(s => s.teamAbbr === 'OKC' || s.teamName.includes('Oklahoma City'));
  if (okc) {
    console.log(`✓ OKC: ${okc.wins}-${okc.losses}`);
  }
  return results;
}
