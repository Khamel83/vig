/**
 * Scoring utilities for The Vig
 * Calculate standings based on selections and game results
 */

import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types';
import { events, selections, standings, options } from './db';

interface GameResult {
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  status: string;
}

interface UserStanding {
  user_id: string;
  user_name: string;
  wins: number;
  losses: number;
  points: number;
  rank: number;
}

/**
 * Calculate standings for an event based on game results
 */
export async function calculateStandings(
  db: D1Database,
  eventId: string
): Promise<UserStanding[]> {
  // Get all selections for this event
  const eventSelections = await selections.listByEvent(db, eventId);

  // Get all games for this event
  const gamesStmt = db.prepare(`
    SELECT id, home_team_id, away_team_id, home_score, away_score, status
    FROM games
    WHERE event_id = ? AND status = 'final'
  `);
  const gamesResult = await gamesStmt.bind(eventId).all<GameResult>();
  const games = gamesResult.results;

  // Calculate wins for each team
  const teamWins = new Map<string, number>();
  const teamLosses = new Map<string, number>();

  for (const game of games) {
    if (game.home_score > game.away_score) {
      teamWins.set(game.home_team_id, (teamWins.get(game.home_team_id) || 0) + 1);
      teamLosses.set(game.away_team_id, (teamLosses.get(game.away_team_id) || 0) + 1);
    } else if (game.away_score > game.home_score) {
      teamWins.set(game.away_team_id, (teamWins.get(game.away_team_id) || 0) + 1);
      teamLosses.set(game.home_team_id, (teamLosses.get(game.home_team_id) || 0) + 1);
    }
    // Ties don't count as wins or losses
  }

  // Group selections by user
  const userSelections = new Map<string, string[]>();
  for (const sel of eventSelections) {
    const existing = userSelections.get(sel.user_id) || [];
    existing.push(sel.option_id);
    userSelections.set(sel.user_id, existing);
  }

  // Get user names
  const usersStmt = db.prepare(`SELECT id, name FROM users WHERE id IN (${Array(userSelections.size).fill('?').join(',')})`);
  const userIds = Array.from(userSelections.keys());
  const usersResult = userIds.length > 0
    ? await usersStmt.bind(...userIds).all<{ id: string; name: string }>()
    : { results: [] };
  const userNames = new Map(usersResult.results.map((u) => [u.id, u.name]));

  // Calculate standings for each user
  const userStandings: UserStanding[] = [];

  for (const [userId, selectedTeams] of userSelections) {
    let totalWins = 0;
    let totalLosses = 0;

    for (const teamId of selectedTeams) {
      totalWins += teamWins.get(teamId) || 0;
      totalLosses += teamLosses.get(teamId) || 0;
    }

    // Points = wins (can be customized based on pool type)
    const points = totalWins;

    userStandings.push({
      user_id: userId,
      user_name: userNames.get(userId) || 'Unknown',
      wins: totalWins,
      losses: totalLosses,
      points,
      rank: 0, // Will be calculated below
    });
  }

  // Sort by points (desc), then by wins (desc)
  userStandings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.wins - a.wins;
  });

  // Assign ranks
  for (let i = 0; i < userStandings.length; i++) {
    userStandings[i].rank = i + 1;
  }

  // Persist standings to database
  for (const standing of userStandings) {
    await standings.upsert(db, {
      event_id: eventId,
      user_id: standing.user_id,
      wins: standing.wins,
      losses: standing.losses,
      points: standing.points,
      rank: standing.rank,
    });
  }

  return userStandings;
}

/**
 * Broadcast standings update via Durable Object
 */
export async function broadcastStandingsUpdate(
  leaderboardDO: DurableObjectNamespace,
  eventId: string,
  standings: UserStanding[]
): Promise<void> {
  // Get the DO instance for this event
  const doId = leaderboardDO.idFromName(eventId);
  const stub = leaderboardDO.get(doId);

  // Send update to DO
  await stub.fetch('http://do/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, standings }),
  });
}

/**
 * Calculate and broadcast standings for an event
 */
export async function updateEventStandings(
  db: D1Database,
  leaderboardDO: DurableObjectNamespace,
  eventId: string
): Promise<UserStanding[]> {
  const newStandings = await calculateStandings(db, eventId);
  await broadcastStandingsUpdate(leaderboardDO, eventId, newStandings);
  return newStandings;
}
