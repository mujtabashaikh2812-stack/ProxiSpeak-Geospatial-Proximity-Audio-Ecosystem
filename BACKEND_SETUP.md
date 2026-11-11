ProxiSpeak Backend Setup
========================

This document covers the Week 1 and Week 2 database work for the dev-kuldeep branch.
For the schemas, indexes, query reference and measured figures see DATABASE_ARCHITECTURE.md.

1. Environment variables
-------------------------

Copy .env.example to .env and adjust values for local development. Never commit
real secrets. The .env file is ignored by Git.

MONGODB_URI
  MongoDB connection URI. Default fallback in db.js is:
  mongodb://127.0.0.1:27017/procsispeak
  Point this to a disposable development/test database. Never seed production.

SEED_DB
  Set to "development" to allow running the seed script. Seeding is refused
  unless SEED_DB=development or the --confirm-seed flag is passed.

2. Environment loading
----------------------

loadEnv.js reads .env from the project root using the fs module. It parses
simple KEY=value lines, skips blank lines and lines starting with #, strips
surrounding quotes, and sets only keys not already in process.env so real
environment variables always win. It does not throw if .env is missing.
loadEnv() is called at the top of db.js before anything reads process.env.

3. Safe development/test database setup
----------------------------------------

Install MongoDB locally if you want to run integration tests, seeding, or the
demo. Do not start system services or change your computer's MongoDB setup
automatically.

The connection URI comes from the MONGODB_URI environment variable. If not set,
db.js falls back to mongodb://127.0.0.1:27017/procsispeak with a 5 second
server-selection timeout so a missing database does not hang.

4. Coordinate mapping and provisional assumptions
-------------------------------------------------

This project uses a 2D virtual-office canvas and a 100-pixel proximity radius.
Raw canvas coordinates are not longitude and latitude.

The file canvasToGeo.js maps finite canvas (x, y) pixel coordinates to valid
GeoJSON [longitude, latitude] pairs around a documented synthetic origin.

- Synthetic origin: canvas (0, 0) maps to GeoJSON (0, 0).
- Canvas x increases to the right (east, longitude increases).
- Canvas y increases downward (south, latitude decreases).
- Scale constant: METRES_PER_PIXEL = 1 (1 canvas pixel = 1 metre).
- This scale is provisional for development only and requires Mujtaba's
  approval before production use.

Formula:
  radiusMetres = radiusPixels * METRES_PER_PIXEL

Because METRES_PER_PIXEL is 1, radiusMetres equals radiusPixels numerically.

Canvas coordinates are stored on each User document as canvasX and canvasY so
that exact pixel-distance filtering can be applied after MongoDB $near
candidate retrieval.

Spherical distance and flat canvas distance are not exactly identical. The
proximity service uses MongoDB $near for indexed candidate retrieval and an
exact canvas-distance check (Math.hypot) for the final result. Do not promise
exact 100-pixel behaviour from a naive spherical query alone.

This coordinate mapping is a LOCAL-WORLD MAPPING that needs Mujtaba's approval.
It is NOT a requirement confirmed by the mentor.

5. Pixel-to-metre formula
-------------------------

radiusMetres = radiusPixels * METRES_PER_PIXEL

If a constant named PIXELS_PER_METRE is used instead, the formula must be:
  radiusMetres = radiusPixels / PIXELS_PER_METRE

Never mix these formulas.

6. Seed safety and reserved user IDs
-------------------------------------

The seed script (seed.js) uses idempotent upserts with a reserved seed
namespace prefix: seed:proxispeak:v1:.

Running the seed script twice does not create duplicates because it upserts on
the reserved userId values. Seeding uses bulkWrite with upsert, not
transactions, so it works on a standalone local MongoDB (no replica set needed).

Safety rules:
- Never runs User.deleteMany({}) or any unfiltered deletion.
- Never drops a database or collection.
- Never removes unrelated users.
- Never seeds a production database. Refuses if MONGODB_URI contains
  "production" or "prod.mongodb".
- Requires explicit opt-in: SEED_DB=development or --confirm-seed flag.

Seed commands for three shells:
  PowerShell:  $env:SEED_DB="development"; node seed.js
  cmd:         set SEED_DB=development && node seed.js
  bash:        SEED_DB=development node seed.js

7. Commands to run tests and benchmarks
---------------------------------------

npm test              Run all tests (node --test, no path argument)
npm run test:unit     Run unit tests only (node --test tests/unit.test.js)
npm run seed          Run safe seed script (requires MongoDB + SEED_DB=development)
npm run demo          Run proximity query demo (requires MongoDB)
npm run benchmark     Run performance benchmark (requires MongoDB, 35 iterations)

Unit tests do not require MongoDB. Integration tests, seeding, demo, and
benchmark require a running MongoDB instance.

8. Actual completed work
-------------------------

Week 1 (database layer):
- db.js: MONGODB_URI environment variable with local fallback,
  serverSelectionTimeoutMS of 5000 ms, connection failures propagate to caller,
  clear success/failure messages, no secrets printed. loadEnv.js reads .env.
- User.js: Mongoose model with required nonblank userId, displayName field
  (String, trimmed, not required, maxlength 80), GeoJSON Point location with
  enum type "Point", validated two-element coordinates (longitude first,
  latitude second, -180 to 180 / -90 to 90), canvasX and canvasY fields for
  exact pixel filtering, 2dsphere index declared on location.
- canvasToGeo.js: shared canvas-to-GeoJSON conversion utility with
  METRES_PER_PIXEL scale, optional scale argument, documented canvas y-axis
  direction, world bounds validation.
- seed.js: safe idempotent seed script with reserved namespace, 10 deterministic
  mock users (4 inside 100px radius, 6 outside), index verification, finally
  block cleanup, nonzero exit on failure. No transactions (works on standalone).

Week 2 (proximity service):
- proximityService.js: MongoDB $near on indexed GeoJSON location, pixel-to-metre
  conversion, CANDIDATE_MARGIN_METRES allowance (1 metre) for safe candidate
  retrieval, exact canvas-distance filter, lean() results, field selection,
  requesting-user exclusion, input validation, no silent connection inside the
  service function.

Tests:
- tests/unit.test.js: 33 unit tests covering schema validation, coordinate
  conversion, pixel scaling, canvas y-axis direction, boundary values, and
  more. All pass without MongoDB.
- tests/integration.test.js: 3 integration tests (2dsphere index existence,
  repeatable seeding, requesting-user exclusion). Total is 36 tests: 33 pass
  and 3 skip when no database is present. When a database is available, or
  when mongodb-memory-server can start as a fallback, all 3 integration tests
  run and pass.

9. Verifying without installing MongoDB
---------------------------------------

Run the single command:

    npm run verify:db

This runs node verifyDb.js, which starts an in-memory single-node MongoDB on
this laptop, connects Mongoose to it, and proves seven things:

1. The location 2dsphere index really exists in the live database.
2. Seeding is idempotent: the seed count is 10 after the first run and still
   10 after the second run.
3. The proximity query returns exactly four seed users within 100 canvas
   pixels of the centre and none of the six outside users.
4. A user at exactly 100 pixels is returned and a user at 100.5 pixels is not.
5. excludeUserId removes the requesting user while the other three remain.
6. The benchmark prints min, median, average, p95 and max for both the raw
   $near query and the full proximity service, and states whether the full
   service average stays under 20 milliseconds.
7. The test database is dropped and the memory server is stopped.

All timings printed by verifyDb.js come from an in-memory database on this
laptop and are not production latency figures.

9. Remaining limitations and decisions needed
---------------------------------------------

- MongoDB is not installed on this machine. Integration tests, seeding, demo,
  and benchmarks cannot run until MongoDB is available. Report these as blocked,
  not skipped.
- The coordinate mapping (METRES_PER_PIXEL = 1, origin at 0,0) is provisional
  and needs Mujtaba's approval.
- package.json license is ISC; README badge shows MIT. Report this mismatch for
  the team to decide. Do not change the license based on a badge alone.
- The 2dsphere index declared in source code does not prove it exists in
  MongoDB until integration tests run against a live database.
- benchmark.js reports database query timing and full service timing separately.

10. License note
----------------

package.json declares ISC. README badge shows MIT. This mismatch is reported
11. Session pruning
-------------------

pruneStaleSessions in sessionPruner.js finds users whose lastSeenAt is older than the cut-off (default 30 minutes) and either deletes them (dryRun false) or only reports them (dryRun true). dryRun defaults to true so nothing is deleted by accident. Run a real prune with: node -e "require('./sessionPruner').pruneStaleSessions({maxIdleMinutes:30,dryRun:false}).then(console.log)"

12. Office zone seeding
-----------------------

13. Zone API handlers
---------------------

Exported functions: listZones, createZone, findZonesContainingCanvasPoint, registerZoneRoutes.
Routes: GET /api/db/zones and POST /api/db/zones.
Request and response: listZones returns { count, zones }; createZone accepts zoneId, name, type, isSoundproof, isSpotlightBroadcast, isActive, and either canvasBoundary in pixels or boundary in GeoJSON, and returns { zone } with status 201. Bad input returns 400 with an error naming the offending field; a duplicate zoneId returns 409. findZonesContainingCanvasPoint performs a real $geoIntersects query then confirms candidates in pixels. express is intentionally not a dependency here; the lead mounts these handlers on his own server.

## Session history

UserSession model records one stay in one room. Functions: openSession, closeSession, getZoneOccupancy, getDwellTimeForUser, getDwellTimeByZone. One open session per user at most. Run tests with: node --test tests/sessionHistory.test.js

Session history sheet fields: socketId, joinedAt, leftAt, totalDwellSeconds, zonesVisited. Helpers: recordZoneEntry(userId, zoneId), recordZoneExit(userId, zoneId). joinedAt and leftAt mirror enteredAt and exitedAt and are kept in sync by sessionHistory.js.

Nearby cache bridge: services/spatialCache.js belongs to the leader and is not duplicated. services/nearbyCacheBridge.js is the adapter. It is a no-op while his file is absent. After merge his cache is the only cache and the bridge activates against it with no further change.

Coordinate sanitization: room bounds 0 to 1200 by 0 to 800, distinct from MAX_CANVAS_COORD 100000. Exported functions: validateCanvasCoordinate, validateCanvasPoint, sanitizeGeoJSONPoint, validateRadiusPixels, validateNearbyRequest, asMiddleware. Bad input returns 400. The middleware never imports express so it mounts on the lead's server unchanged.

Docker Compose for local MongoDB
------------------------------------

Command to start: docker compose -f docker-compose.mongo.yml up -d
Command to check health: docker compose -f docker-compose.mongo.yml ps
Command to read seeder output: docker compose -f docker-compose.mongo.yml logs seeder
Command to stop: docker compose -f docker-compose.mongo.yml down
Warning: down with the -v flag deletes the data volume, do not use it casually.
This container is standalone on purpose, without a replica set and without transactions, matching how the backend is written.

## Index migration

The users collection now has a status field (online, idle or offline, default offline) and a compound index on status ascending plus location 2dsphere, named status_1_location_2dsphere. The status field was added because the compound index needs something to lead with: before this change the User model had no status at all. The compound index serves queries that filter by status and then search by distance, so a query for online users only walks index entries that belong to online users.

The single field location_2dsphere index is kept by default. proximityService.js runs $near queries that do not filter by status, and those still rely on the single field index. Dropping it is opt in.

Commands:
- node scripts/migrateIndexes.js migrates the database named by MONGODB_URI. It refuses to run when the URI looks like production, creates the compound index only when it is missing, and prints the index list before and after.
- node scripts/migrateIndexes.js --memory does the same against a temporary in-memory MongoDB, so it runs with no Docker and no installed MongoDB. The temporary database is dropped and the server stopped at the end.
- node scripts/migrateIndexes.js --dropLegacy also drops the single field location_2dsphere index. Only use it once nothing queries by location without a status filter.

Each run prints PASS or FAIL lines, including an explain("executionStats") proof for a status online query with $near and $maxDistance: the winning index name, keysExamined, docsExamined and executionTimeMillis. The script exits 1 if any check fails. The same command is available as npm run migrate:indexes.

## Load test

Command: npm run loadtest (the same as node benchmark/loadTest.js). It fires many findUsersNearCanvasPoint calls at the same time and reports how long each one took.

Options:
- --concurrency N is how many queries are in flight at once. Default 100.
- --total N is how many queries are fired in all. Default 500.
- --radius N is the search radius in canvas pixels. Default 100.
- --users N is how many avatars are seeded. Default 300, with roughly a quarter inside the radius of the test point and the rest outside it.
- --memory forces the temporary in-memory MongoDB even when MONGODB_URI is set.

Avatars are moved (re-seeded) between waves of queries, so the queries see moving avatars and not one static snapshot. Before measuring, one warm-up round opens the connection pool; those queries are not counted.

Metrics: total queries is the number requested and completed is the number that finished. Wall clock ms is the time spent running the query waves, with re-seeding excluded. Throughput is successful queries per second over that wall clock time. Latency min, median, mean, p95, p99 and max are in milliseconds per query; p95 means 95 percent of queries were faster than that number. Percentiles use linear interpolation between neighbouring samples. Errors is the number of queries that threw.

The run prints one PASS or FAIL line each for: error count is zero, all requested queries completed, and p95 latency strictly under 20 ms. It exits 1 if any fails. The 20 ms budget is not loosened to make a run pass.

When MONGODB_URI is not set, the test starts a temporary in-memory MongoDB by default and drops its database at the end, so it runs on any machine with no Docker and no installed MongoDB. If MONGODB_URI is set and --memory is not given, the avatars are written under the prefix loadtest:avatar: and removed afterwards; production looking URIs are refused.

The figures are from an in-memory single node database on the same machine and are not a production network number; a networked figure needs the Docker container in docker-compose.mongo.yml.

## User profile API

routes/userRoutes.js holds the profile and avatar handlers. They are framework free in the same way as routes/zoneRoutes.js: each function returns a plain { status, body } object and never throws. The :id in the paths is the User userId string, the business key of the schema. Only when no user has that userId and the string is a valid 24 character ObjectId is the Mongo _id tried as a fallback.

New optional fields on User: avatarColor (hex colour, a hash followed by six hexadecimal digits, default null), shirtSpriteId (string, at most 64 characters, default null) and statusMessage (string, at most 140 characters, default empty). Existing fields and both indexes are unchanged.

- GET /api/db/users/:id calls getUserProfile(userId). Returns 200 with { user } holding userId, displayName, avatarColor, shirtSpriteId, statusMessage, status, canvasX, canvasY and lastSeenAt. A blank or non string id returns 400. An unknown user returns 404.
- PUT /api/db/users/:id/avatar calls updateUserAvatar(userId, payload). The payload may hold any combination of avatarColor, shirtSpriteId and statusMessage and must hold at least one, otherwise 400. A colour that is not a hex colour, a status message over 140 characters or a shirt sprite id over 64 characters returns 400 naming the field, before the database is touched. An unknown user returns 404. A database error returns a 500 result object and is never thrown. Success returns 200 with { user } in the same shape as the GET.
- getProfilesForUsers(userIds) is the batch call for the roster. It takes an array of at most 100 userId strings, returns 200 with { count, users } sorted by userId, and returns 400 for a non array or more than 100 entries.
- registerUserRoutes(app, basePath) mounts the GET and PUT paths on an Express like app. The default base path is /api/db/users. It throws a clear error when the argument has no get and put methods.

Tests: node --test tests/userRoutes.test.js. The numbered harness npm run verify:db covers this API as Check 15.
