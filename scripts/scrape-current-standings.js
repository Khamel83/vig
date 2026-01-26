import { chromium } from 'playwright';

// Team name to abbreviation mapping
const TEAM_ABBR_MAP = {
  'Oklahoma City Thunder': 'OKC',
  'Atlanta Hawks': 'ATL',
  'Boston Celtics': 'BOS',
  'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA',
  'Chicago Bulls': 'CHI',
  'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL',
  'Denver Nuggets': 'DEN',
  'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GS',
  'Houston Rockets': 'HOU',
  'Indiana Pacers': 'IND',
  'Los Angeles Clippers': 'LAC',
  'Los Angeles Lakers': 'LAL',
  'Memphis Grizzlies': 'MEM',
  'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL',
  'Minnesota Timberwolves': 'MIN',
  'New Orleans Pelicans': 'NO',
  'New York Knicks': 'NYK',
  'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI',
  'Phoenix Suns': 'PHX',
  'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC',
  'San Antonio Spurs': 'SA',
  'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTAH',
  'Washington Wizards': 'WSH',
};

async function scrapeNBAStandings() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://www.basketball-reference.com/leagues/NBA_2026_standings.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(2000);

    // Find the Eastern Conference table
    const standings = await page.evaluate(() => {
      const results = [];
      const tables = document.querySelectorAll('table');

      // Helper to get team name from link
      const getTeamName = (row) => {
        const link = row.querySelector('a[href*="/teams/"]');
        return link ? link.textContent.trim() : '';
      };

      // Helper to get stat value
      const getStat = (row, statName) => {
        const cell = row.querySelector(`[data-stat="${statName}"]`);
        return cell ? cell.textContent.trim() : '';
      };

      // Eastern Conference
      const easternTable = document.querySelector('#confs_standings_E');
      if (easternTable) {
        const rows = easternTable.querySelectorAll('tbody tr:not(.thead)');
        rows.forEach(row => {
          const teamName = getTeamName(row);
          const wins = getStat(row, 'wins');
          const losses = getStat(row, 'losses');
          if (teamName && wins && losses) {
            results.push({ teamName, wins: parseInt(wins), losses: parseInt(losses) });
          }
        });
      }

      // Western Conference
      const westernTable = document.querySelector('#confs_standings_W');
      if (westernTable) {
        const rows = westernTable.querySelectorAll('tbody tr:not(.thead)');
        rows.forEach(row => {
          const teamName = getTeamName(row);
          const wins = getStat(row, 'wins');
          const losses = getStat(row, 'losses');
          if (teamName && wins && losses) {
            results.push({ teamName, wins: parseInt(wins), losses: parseInt(losses) });
          }
        });
      }

      return results;
    });

    // Add abbreviations
    const withAbbr = standings.map(s => ({
      ...s,
      abbr: TEAM_ABBR_MAP[s.teamName] || s.teamName.substring(0, 3).toUpperCase(),
    }));

    await browser.close();
    return withAbbr;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function main() {
  console.log('Scraping NBA standings from basketball-reference.com...\n');
  const standings = await scrapeNBAStandings();

  console.log(`Found ${standings.length} teams:\n`);
  standings.sort((a, b) => b.wins - a.wins);

  standings.forEach(s => {
    console.log(`${s.abbr}: ${s.wins}-${s.losses} (${s.teamName})`);
  });

  // Generate SQL INSERT statements
  console.log('\n\n=== SQL INSERT STATEMENTS ===\n');
  const eventId = 'nba26-event';
  const now = Math.floor(Date.now() / 1000);

  standings.forEach(s => {
    const teamId = `nba26-${s.abbr.toLowerCase()}`;
    console.log(`INSERT INTO espn_standings (id, event_id, sport, team_id, team_name, team_abbr, wins, losses, sync_source, synced_at)`);
    console.log(`VALUES ('${eventId}-${teamId}', '${eventId}', 'nba', '${teamId}', '${s.teamName.replace(/'/g, "''")}', '${s.abbr}', ${s.wins}, ${s.losses}, 'sports-reference-scrape', ${now});`);
  });

  console.log(`\n\nTotal: ${standings.length} teams`);
}

main().catch(console.error);
