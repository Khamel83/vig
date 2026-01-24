// Worker script to sync NBA games
// Can be triggered via HTTP or Cloudflare Cron

const API_BASE = 'https://therundown-therundown-v1.p.rapidapi.com';
const SPORT_ID = '4';
const EVENT_ID = 'nba26-event';

// Team ID map
const TEAM_EXTERNAL_IDS = {
  'nba26-okc': '18', 'nba26-cle': '7', 'nba26-nyk': '3', 'nba26-den': '16',
  'nba26-hou': '27', 'nba26-orl': '14', 'nba26-gs': '21', 'nba26-lac': '22',
  'nba26-min': '17', 'nba26-det': '8', 'nba26-atl': '11', 'nba26-sa': '30',
  'nba26-dal': '26', 'nba26-lal': '23', 'nba26-mil': '10', 'nba26-bos': '1',
  'nba26-mem': '28', 'nba26-phi': '4', 'nba26-ind': '9', 'nba26-tor': '5',
  'nba26-mia': '13', 'nba26-sac': '25', 'nba26-chi': '6', 'nba26-cha': '12',
  'nba26-por': '19', 'nba26-no': '29', 'nba26-phx': '24', 'nba26-utah': '20',
  'nba26-bkn': '2', 'nba26-wsh': '15',
};

const TEAM_ID_TO_OPTION = Object.fromEntries(
  Object.entries(TEAM_EXTERNAL_IDS).map(([optId, extId]) => [extId, optId])
);

function mapGameStatus(status) {
  const statusMap = {
    'STATUS_SCHEDULED': 'scheduled',
    'STATUS_IN_PROGRESS': 'in_progress',
    'STATUS_HALFTIME': 'in_progress',
    'STATUS_END_PERIOD': 'in_progress',
    'STATUS_FINAL': 'final',
  };
  return statusMap[status] || 'scheduled';
}

// Main sync function - can be called from either HTTP or scheduled trigger
async function runSync(env, API_KEY) {
  async function fetchGames(date) {
    const url = `${API_BASE}/sports/${SPORT_ID}/events/${date}`;
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': API_KEY,
        'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      throw new Error(`TheRundown API error: ${response.status}`);
    }

    const data = await response.json();
    return data.events || [];
  }

  async function syncGames() {
    // Only sync last 7 days to save API calls
    // Games that already exist will be upserted (no duplicates)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const endDate = new Date();
    let synced = 0;
    let updated = 0;

    const currentDate = new Date(startDate);
    const errors = [];

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];

      try {
        const games = await fetchGames(dateStr);
        if (games.length > 0) {
          console.log(`${dateStr}: ${games.length} games`);
        }

        for (const game of games) {
          const homeTeam = game.teams_normalized?.find((t) => t.is_home);
          const awayTeam = game.teams_normalized?.find((t) => t.is_away);

          if (!homeTeam || !awayTeam) continue;

          const homeExtId = String(homeTeam.team_id);
          const awayExtId = String(awayTeam.team_id);

          const homeOptionId = TEAM_ID_TO_OPTION[homeExtId];
          const awayOptionId = TEAM_ID_TO_OPTION[awayExtId];

          if (!homeOptionId && !awayOptionId) continue;

          const gameStatus = mapGameStatus(game.score?.event_status || 'STATUS_SCHEDULED');
          const scheduledAt = Math.floor(new Date(game.event_date).getTime() / 1000);

          const stmt = env.DB.prepare(`
            INSERT INTO games (id, event_id, external_id, home_team_id, away_team_id, home_score, away_score, status, scheduled_at, metadata, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
            ON CONFLICT(external_id) DO UPDATE SET
              home_score = excluded.home_score,
              away_score = excluded.away_score,
              status = excluded.status,
              metadata = excluded.metadata,
              updated_at = strftime('%s', 'now')
          `);

          await stmt.bind(
            crypto.randomUUID(),
            EVENT_ID,
            game.event_id,
            homeOptionId || null,
            awayOptionId || null,
            game.score?.score_home ?? null,
            game.score?.score_away ?? null,
            gameStatus,
            scheduledAt,
            JSON.stringify({
              venue: game.score?.venue_name,
              broadcast: game.score?.broadcast,
              period: game.score?.game_period,
              clock: game.score?.display_clock,
            })
          ).run();

          synced++;
          if (gameStatus === 'final') updated++;
        }
      } catch (error) {
        // Log errors but continue
        errors.push(`${dateStr}: ${error.message}`);
        console.error(`Error syncing ${dateStr}:`, error.message);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { synced, updated, startDate, endDate, errors };
  }

  async function calculateStandings() {
    // Get all selections
    const selectionsStmt = env.DB.prepare(`
      SELECT s.user_id, s.option_id
      FROM selections s
      WHERE s.event_id = ?
    `);
    const selectionsResult = await selectionsStmt.bind(EVENT_ID).all();

    // Get all completed games
    const gamesStmt = env.DB.prepare(`
      SELECT home_team_id, away_team_id, home_score, away_score
      FROM games
      WHERE event_id = ? AND status = 'final'
    `);
    const gamesResult = await gamesStmt.bind(EVENT_ID).all();

    const selections = selectionsResult.results;
    const games = gamesResult.results;

    // Calculate wins per team
    const teamWins = {};
    const teamLosses = {};

    for (const game of games) {
      if (!game.home_team_id || !game.away_team_id) continue;

      const homeScore = game.home_score;
      const awayScore = game.away_score;

      if (homeScore > awayScore) {
        teamWins[game.home_team_id] = (teamWins[game.home_team_id] || 0) + 1;
        teamLosses[game.away_team_id] = (teamLosses[game.away_team_id] || 0) + 1;
      } else {
        teamWins[game.away_team_id] = (teamWins[game.away_team_id] || 0) + 1;
        teamLosses[game.home_team_id] = (teamLosses[game.home_team_id] || 0) + 1;
      }
    }

    // Calculate user standings
    const userStandings = {};

    for (const selection of selections) {
      const userId = selection.user_id;
      const optionId = selection.option_id;

      if (!userStandings[userId]) {
        userStandings[userId] = { wins: 0, losses: 0 };
      }

      userStandings[userId].wins += teamWins[optionId] || 0;
      userStandings[userId].losses += teamLosses[optionId] || 0;
    }

    // Update standings table
    for (const [userId, standing] of Object.entries(userStandings)) {
      const updateStmt = env.DB.prepare(`
        INSERT INTO standings (event_id, user_id, wins, losses, points, rank, updated_at)
        VALUES (?, ?, ?, ?, 0, NULL, strftime('%s', 'now'))
        ON CONFLICT(event_id, user_id) DO UPDATE SET
          wins = excluded.wins,
          losses = excluded.losses,
          updated_at = excluded.updated_at
      `);

      await updateStmt.bind(EVENT_ID, userId, standing.wins, standing.losses).run();
    }

    return userStandings;
  }

  const { synced, updated, startDate, endDate, errors } = await syncGames();
  const standings = await calculateStandings();

  return {
    synced,
    updated,
    date_range: `${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    errors: errors.length > 0 ? errors : undefined,
    standings: Object.entries(standings).map(([userId, s]) => ({ userId, ...s })),
  };
}

// HTTP handler for manual triggers
export default {
  async fetch(request, env) {
    try {
      const API_KEY = env.THE_RUNDOWN_API_KEY || '1f8078b504msh2dab2e95ae91a37p1f30cdjsncbb1bc069dca';
      const result = await runSync(env, API_KEY);

      return new Response(JSON.stringify({
        success: true,
        ...result,
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },

  // Scheduled handler for Cron triggers
  async scheduled(event, env, ctx) {
    try {
      const API_KEY = env.THE_RUNDOWN_API_KEY || '1f8078b504msh2dab2e95ae91a37p1f30cdjsncbb1bc069dca';
      const result = await runSync(env, API_KEY);

      console.log('NBA sync completed:', JSON.stringify({
        synced: result.synced,
        updated: result.updated,
        date_range: result.date_range,
      }));

      return;
    } catch (error) {
      console.error('Scheduled sync error:', error.message, error.stack);
    }
  },
};
