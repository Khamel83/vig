# TheSportsDB API Documentation - Free Tier v1

**Source:** https://www.thesportsdb.com/documentation
**API Key:** `123` (free tier)
**Base URL:** `https://www.thesportsdb.com/api/v1/json`

## Key Limitations for Our Use Case

### ❌ NO NBA/NFL/MLB/NHL STANDINGS
The `lookuptable.php` endpoint is **limited to featured soccer leagues ONLY**.
- ✅ Soccer standings (Premier League, La Liga, Bundesliga, Serie A, Ligue 1, etc.)
- ❌ NO NBA standings
- ❌ NO NFL standings
- ❌ NO MLB standings
- ❌ NO NHL standings

### Rate Limits
- Free: 30 requests per minute
- Premium: 100 requests per minute
- Business: 120 requests per minute

---

## V1 API Endpoints

### Authentication
```
https://www.thesportsdb.com/api/v1/json/123/{endpoint}
```

---

### Search

**Search Teams:**
```
/searchteams.php?t=Arsenal
```

**Search Events:**
```
/searchevents.php?e=Arsenal_vs_Chelsea
/searchevents.php?e=Arsenal_vs_Chelsea&s=2016-2017
/searchevents.php?e=Arsenal_vs_Chelsea&d=2015-04-26
```

**Search Players:**
```
/searchplayers.php?p=Danny_Welbeck
```

---

### Lookup

**Lookup League:**
```
/lookupleague.php?id=4328
```

**Lookup League Table (STANDINGS - Soccer ONLY):**
```
/lookuptable.php?l=4328
/lookuptable.php?l=4328&s=2020-2021
```
**LIMITED TO FEATURED SOCCER LEAGUES ONLY**

**Lookup Team:**
```
/lookupteam.php?id=133604
```

**Lookup Event:**
```
/lookupevent.php?id=441613
```

**Lookup Event Results:**
```
/eventresults.php?id=652890
```

---

### List

**All Sports:**
```
/all_sports.php
```

**All Countries:**
```
/all_countries.php
```

**All Leagues:**
```
/all_leagues.php
```

**List Teams in League:**
```
/search_all_teams.php?l=English_Premier_League
/search_all_teams.php?s=Soccer&c=Spain
```

**List All Teams by League (NBA):**
```
/search_all_teams.php?l=NBA
```
**Returns:** 30 NBA teams with full details

---

### Schedule

**Events by Day:**
```
/eventsday.php?d=2014-10-10
/eventsday.php?d=2014-10-10&s=Baseball
/eventsday.php?d=2014-10-10&l=MLB
```

**Events by Season:**
```
/eventsseason.php?id=4328&s=2014-2015
```

**Next Events for League:**
```
/eventsnextleague.php?id=4328
```

**Past Events for League:**
```
/eventspastleague.php?id=4328
```

---

## League IDs

### Soccer
- 4328: English Premier League
- 4329: English League Championship
- 4330: Scottish Premier League
- 4331: German Bundesliga
- 4332: Italian Serie A
- 4334: French Ligue 1
- 4335: Spanish La Liga

### Basketball
- 4387: NBA (idLeague from teams endpoint)

### Formula 1
- 4370: Formula 1

---

## What TheSportsDB CAN Do (Free Tier)

✅ List NBA teams (30 teams with details)
✅ Get NBA game schedule by day/season
✅ Search for specific events/games
✅ Get team details, logos, badges
✅ Get event results (past games)
✅ Soccer standings (Premier League, La Liga, etc.)

## What TheSportsDB CANNOT Do (Free Tier)

❌ NBA standings (W-L records)
❌ NFL standings
❌ MLB standings
❌ NHL standings
❌ Live scores (premium only)

---

## Conclusion for Vig

**TheSportsDB is NOT suitable for NBA/NFL/MLB/NHL wins pools.**

It CAN be used for:
- Soccer pools (World Cup, Premier League, etc.)
- F1 (if using points standings, not W-L)
- Getting team lists, logos, badges
- Game schedules

For our NBA wins pool, we still need ESPN API for current W-L records.
