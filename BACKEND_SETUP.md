ProxiSpeak Backend Setup
========================

This document covers the Week 1 and Week 2 database work for the dev-kuldeep branch.

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
- tests/integration.test.js: real integration tests (2dsphere index existence,
  repeatable seeding, requesting-user exclusion). Skipped when MongoDB is
  unavailable. No fake passes.

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
for the team to decide. The license field was not changed based on a badge.
