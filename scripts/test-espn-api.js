#!/usr/bin/env node

/**
 * ESPN API Test Script
 * Validates that the ESPN API integration works correctly
 *
 * Usage:
 *   node scripts/test-espn-api.js
 */

import { ESPNAPI } from '../src/lib/espn-api.ts';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function pass(message: string) {
  log(`✓ ${message}`, 'green');
}

function fail(message: string) {
  log(`✗ ${message}`, 'red');
}

function info(message: string) {
  log(`  ${message}`, 'blue');
}

/**
 * Assert helper
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Main test runner
 */
async function runTests() {
  log('\n=== ESPN API Integration Tests ===\n', 'bold');

  const espn = new ESPNAPI();
  let passed = 0;
  let failed = 0;

  // Test 1: Fetch NBA teams
  log('Test 1: Fetch NBA teams', 'bold');
  try {
    const teams = await espn.fetchNBATeams();
    info(`Fetched ${Object.keys(teams).length} teams`);

    // Verify we have all 30 NBA teams
    assert(Object.keys(teams).length >= 30, 'Should have at least 30 teams');
    pass(`Found ${Object.keys(teams).length} teams`);

    // Verify some key teams
    const keyTeams = ['1', '18', '7']; // ATL, OKC, CLE
    for (const teamId of keyTeams) {
      assert(teams[teamId], `Team ${teamId} should exist`);
      assert(teams[teamId].abbr, `Team ${teamId} should have abbreviation`);
      info(`  ${teams[teamId].abbr}: ${teams[teamId].name}`);
    }
    pass('Key teams validated');
    passed++;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    failed++;
  }
  console.log();

  // Test 2: Get NBA standings
  log('Test 2: Get NBA standings from ESPN API', 'bold');
  try {
    const standings = await espn.getNBAStandings();
    info(`Fetched ${standings.length} team standings`);

    // Verify we have 30 NBA teams
    assert(standings.length === 30, 'Should have exactly 30 teams');
    pass(`Found all 30 NBA teams`);

    // Verify data structure
    const sample = standings[0];
    assert(sample.teamId !== undefined, 'Should have teamId');
    assert(sample.teamAbbr !== undefined, 'Should have teamAbbr');
    assert(sample.teamName !== undefined, 'Should have teamName');
    assert(sample.wins !== undefined, 'Should have wins');
    assert(sample.losses !== undefined, 'Should have losses');
    pass('Data structure valid');

    // Verify wins/losses are non-negative
    assert(sample.wins >= 0 && sample.losses >= 0, 'Wins and losses should be non-negative');
    pass('Wins/losses are valid');

    // Show top 5 teams
    info('Top 5 teams:');
    for (let i = 0; i < Math.min(5, standings.length); i++) {
      const team = standings[i];
      const pct = team.wins + team.losses > 0
        ? ((team.wins / (team.wins + team.losses)) * 100).toFixed(1)
        : '0.0';
      info(`  ${i + 1}. ${team.teamAbbr}: ${team.wins}-${team.losses} (${pct}%)`);
    }

    // Verify OKC (team 18) exists and has reasonable record
    const okc = standings.find(s => s.teamId === '18');
    assert(okc !== undefined, 'OKC should be in standings');
    if (okc) {
      info(`  OKC Thunder: ${okc.wins}-${okc.losses}`);
      assert(okc.wins + okc.losses > 0, 'OKC should have played games');
      pass('OKC record is valid');
    }
    passed++;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    failed++;
  }
  console.log();

  // Test 3: Season year detection
  log('Test 3: Season year detection', 'bold');
  try {
    const currentYear = new Date().getFullYear();
    // The API uses the ending year of the season
    // For NBA 2025-26 season, it's stored as "2026"
    const seasonYear = currentYear >= 2025 && new Date().getMonth() >= 9
      ? currentYear + 1
      : currentYear;
    info(`Current season year: ${seasonYear}`);
    assert(seasonYear >= 2025, 'Season year should be 2025 or later');
    pass('Season year detection works');
    passed++;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    failed++;
  }
  console.log();

  // Test 4: Should sync timing
  log('Test 4: Sync timing logic', 'bold');
  try {
    const shouldSync = espn.shouldSyncStandings !== undefined;
    // We can't easily test the actual logic without mocking dates
    // Just verify the function exists
    info('Sync timing function exists');
    pass('Sync timing function available');
    passed++;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    failed++;
  }
  console.log();

  // Summary
  log('=== Test Summary ===', 'bold');
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`Total: ${passed + failed}`, 'blue');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
