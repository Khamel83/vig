/**
 * Playwright Scraper - Backup for when API-Sports fails
 * Scrapes ESPN standings pages using headless browser
 *
 * This is a fallback when API-Sports is down or rate-limited
 */

import { chromium } from 'playwright';

export interface ScStanding {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  wins: number;
  losses: number;
}

/**
 * Team abbreviation mappings for matching scraped data to our database
 */
const TEAM_ABBREVS: Record<string, string> = {
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
 * Playwright-based scraper for ESPN standings
 * This is a backup when API-Sports fails
 */
export class PlaywrightScraper {
  /**
   * Scrape NBA standings from ESPN
   */
  async scrapeNBA(): Promise<ScStanding[]> {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      await page.goto('https://www.espn.com/nba/standings', {
        waitUntil: 'networkidle',
      });

      // Wait for standings to load
      await page.waitForSelector('.standings', { timeout: 10000 });

      // Extract team data
      const standings = await page.evaluate(() => {
        const results: Array<{ abbr: string; wins: number; losses: number }> = [];

        // ESPN uses specific table structure
        const rows = document.querySelectorAll('.standings tr');

        for (const row of rows) {
          // Get team abbreviation
          const abbrEl = row.querySelector('.abbr');
          if (!abbrEl) continue;

          const abbr = abbrEl.textContent?.trim() || '';
          if (abbr.length !== 3) continue;

          // Get record
          const recordEl = row.querySelector('.stat');
          if (!recordEl) continue;

          const record = recordEl.textContent?.match(/(\d+)-(\d+)/);
          if (!record) continue;

          results.push({
            abbr,
            wins: parseInt(record[1], 10),
            losses: parseInt(record[2], 10),
          });
        }

        return results;
      });

      await browser.close();

      return standings.map(s => ({
        teamId: TEAM_ABBREVS[s.abbr] || s.abbr,
        teamName: s.abbr,
        teamAbbr: s.abbr,
        wins: s.wins,
        losses: s.losses,
      }));
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Scrape NFL standings from ESPN
   */
  async scrapeNFL(): Promise<ScStanding[]> {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      await page.goto('https://www.espn.com/nfl/standings', {
        waitUntil: 'networkidle',
      });

      await page.waitForSelector('.standings', { timeout: 10000 });

      const standings = await page.evaluate(() => {
        const results: Array<{ abbr: string; wins: number; losses: number; ties?: number }> = [];
        const rows = document.querySelectorAll('.standings tr');

        for (const row of rows) {
          const abbrEl = row.querySelector('.abbr');
          if (!abbrEl) continue;

          const abbr = abbrEl.textContent?.trim() || '';

          const recordEl = row.querySelector('.stat');
          if (!recordEl) continue;

          // NFL has ties: W-L-T
          const record = recordEl.textContent?.match(/(\d+)-(\d+)-(\d+)/) ||
                        recordEl.textContent?.match(/(\d+)-(\d+)/);

          if (!record) continue;

          results.push({
            abbr,
            wins: parseInt(record[1], 10),
            losses: parseInt(record[2], 10),
            ties: record[3] ? parseInt(record[3], 10) : undefined,
          });
        }

        return results;
      });

      await browser.close();

      return standings.map(s => ({
        teamId: s.abbr,
        teamName: s.abbr,
        teamAbbr: s.abbr,
        wins: s.wins,
        losses: s.losses,
      }));
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Scrape MLB standings from ESPN
   */
  async scrapeMLB(): Promise<ScStanding[]> {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      await page.goto('https://www.espn.com/mlb/standings', {
        waitUntil: 'networkidle',
      });

      await page.waitForSelector('.standings', { timeout: 10000 });

      // Similar parsing to NBA
      const standings = await this.scrapeGenericStandings(page);
      await browser.close();
      return standings;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Scrape NHL standings from ESPN
   */
  async scrapeNHL(): Promise<ScStanding[]> {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      await page.goto('https://www.espn.com/nhl/standings', {
        waitUntil: 'networkidle',
      });

      await page.waitForSelector('.standings', { timeout: 10000 });

      const standings = await this.scrapeGenericStandings(page);
      await browser.close();
      return standings;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Generic standings scraper for ESPN pages
   */
  private async scrapeGenericStandings(page: any): Promise<ScStanding[]> {
    return await page.evaluate(() => {
      const results: Array<{ abbr: string; wins: number; losses: number }> = [];
      const rows = document.querySelectorAll('.standings tr');

      for (const row of rows) {
        const abbrEl = row.querySelector('.abbr, .team-name');
        if (!abbrEl) continue;

        const abbr = abbrEl.textContent?.trim().substring(0, 3).toUpperCase() || '';

        const recordEl = row.querySelector('.stat, .record');
        if (!recordEl) continue;

        const record = recordEl.textContent?.match(/(\d+)-(\d+)/);
        if (!record) continue;

        results.push({
          abbr,
          wins: parseInt(record[1], 10),
          losses: parseInt(record[2], 10),
        });
      }

      return results;
    });
  }
}

/**
 * Sync scraped standings to D1 database
 */
export async function syncScrapedStandings(
  db: import('@cloudflare/workers-types').D1Database,
  standings: ScStanding[],
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
        'playwright-scrape',
        Math.floor(Date.now() / 1000)
      )
      .run();

    synced++;
  }

  return { synced, source: 'playwright-scrape' };
}
