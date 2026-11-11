# ProxiSpeak Database Architecture

Branch: dev-kuldeep. Every figure and index name below was produced by a command run on 2026-11-10 (Node v22.23.4, npm 11.21.1, mongodb-memory-server serving MongoDB 8.2.6) or is quoted from the source file named next to it. Anything that could not be checked is marked "unverified".

## 1. Purpose

This document describes the MongoDB geospatial layer of ProxiSpeak: the three Mongoose schemas (User, OfficeZone, UserSession), their indexes, the way canvas pixels are projected into GeoJSON so MongoDB can index them, the queries that run against those collections, and the measured performance of the query layer. The Express and Socket.io server and the audio layers live on other branches and are not described or verified here.

## 2. Coordinate system and projection

Canvas pixels are authoritative. The virtual office is 1200 by 800 pixels (OFFICE_MAX_X 1200 and OFFICE_MAX_Y 800 in middleware/validateCoordinates.js, with OFFICE_MIN_COORD 0). GeoJSON exists only so MongoDB can build a 2dsphere index; it is always produced through the helpers in canvasToGeo.js and pixel numbers are never written straight into a GeoJSON document. These are synthetic coordinates, not real GPS positions.

Constants, quoted from canvasToGeo.js:

    const METRES_PER_DEGREE_LATITUDE = 111320;
    const METRES_PER_DEGREE_LONGITUDE_AT_ORIGIN = 111320;
    const ORIGIN_LONGITUDE = 0;
    const ORIGIN_LATITUDE = 0;
    const METRES_PER_PIXEL = 1;
    const MAX_CANVAS_COORD = 100000;

METRES_PER_PIXEL is 1 and is provisional. It is a development default that the team has not confirmed. Canvas (0, 0) maps to ORIGIN_LONGITUDE 0 and ORIGIN_LATITUDE 0. The conversion divides metres by 111320 to get degrees. Canvas x grows to the east, canvas y grows downward (south), so latitude decreases as canvasY increases. Longitude comes first in every GeoJSON pair: [longitude, latitude].

Formulas, quoted from canvasToGeoJSON in canvasToGeo.js:

    const metresEast = canvasX * scaleMetresPerPixel;
    const metresSouth = canvasY * scaleMetresPerPixel;

    const deltaLongitude = metresEast / METRES_PER_DEGREE_LONGITUDE_AT_ORIGIN;
    const deltaLatitude = metresSouth / METRES_PER_DEGREE_LATITUDE;

    const longitude = ORIGIN_LONGITUDE + deltaLongitude;
    const latitude = ORIGIN_LATITUDE - deltaLatitude;

    return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];

Radius conversion for $near, quoted from pixelsToMetres: radiusMetres = radiusPixels * scaleMetresPerPixel. With the current scale, pixelsToMetres(100) returned 100 when run.

Worked example, run with node on 2026-11-10: canvasToGeoJSON(600, 400) returned [0.00539, -0.003593].

    canvasX = 600, canvasY = 400, scale = 1 metre per pixel
    metresEast  = 600 * 1 = 600
    metresSouth = 400 * 1 = 400
    deltaLongitude = 600 / 111320 = 0.0053898670499461015
    deltaLatitude  = 400 / 111320 = 0.0035932446999640674
    longitude = 0 + 0.0053898670... = 0.005390 after toFixed(6), printed as 0.00539
    latitude  = 0 - 0.0035932446... = -0.003593 after toFixed(6)
    result    = [0.00539, -0.003593]

Other points run the same way: canvasToGeoJSON(0, 0) returned [0, 0] and canvasToGeoJSON(1200, 800) returned [0.01078, -0.007186], the far corner of the room.

Two limits exist and they have different jobs. MAX_CANVAS_COORD = 100000 in canvasToGeo.js is an absolute sanity ceiling: it guarantees that any mapped value stays inside the valid GeoJSON range (longitude -180 to 180, latitude -90 to 90) and it makes the converter throw on absurd input. The real room is 0 to 1200 by 0 to 800 and is enforced separately by middleware/validateCoordinates.js, which clamps or rejects input against the room, not against the ceiling. The ceiling protects the math, the room bounds protect the product, so neither value replaces the other.

## 3. Schema reference

Field lists below are quoted from the output of Object.keys(Model.schema.paths) run on 2026-11-10. The Mongo collection names, as reported by the live database, are users, officezones and usersessions.

### 3.1 User (User.js, collection users)

Paths printed: userId, displayName, location.type, location.coordinates, canvasX, canvasY, lastSeenAt, status, avatarColor, shirtSpriteId, statusMessage, _id, __v. Schema option: strict true.

    userId          String   required, trimmed, unique, must be a nonblank string
    displayName     String   optional, trimmed, maxlength 80
    location.type   String   required, enum ["Point"]
    location.coordinates [Number] required, exactly two finite numbers,
                             longitude -180..180 then latitude -90..90
    canvasX         Number   required, must be a finite number
    canvasY         Number   required, must be a finite number
    lastSeenAt      Date     optional, default Date.now (used by session pruning)
    status          String   trimmed, enum online | idle | offline, default offline
    avatarColor     String   trimmed, default null, must match #RRGGBB (hash plus six hex digits)
    shirtSpriteId   String   trimmed, maxlength 64, default null
    statusMessage   String   trimmed, maxlength 140, default empty string

avatarColor, shirtSpriteId and statusMessage are the profile customization fields exposed by routes/userRoutes.js.

### 3.2 OfficeZone (models/OfficeZone.js, collection officezones)

Paths printed: zoneId, name, type, isSoundproof, isSpotlightBroadcast, isActive, boundary.type, boundary.coordinates, canvasBoundary, _id, createdAt, updatedAt, __v. Schema options: strict true, timestamps true.

    zoneId               String   required, trimmed, lowercase, unique
    name                 String   required, trimmed, maxlength 80
    type                 String   required, enum enclosed_room | spotlight_stage | open_workspace
    isSoundproof         Boolean  default false
    isSpotlightBroadcast Boolean  default false
    isActive             Boolean  default true
    boundary.type        String   enum ["Polygon"], default Polygon
    boundary.coordinates [[[Number]]] validated: at least one ring, each ring at least
                             four positions, closed, every position a finite
                             [longitude, latitude] pair within valid ranges
    canvasBoundary       [[[Number]]] optional raw pixel rings for audit and containment,
                             never indexed, each coordinate within 100000 in absolute value
    createdAt, updatedAt Date     added by timestamps

### 3.3 UserSession (models/UserSession.js, collection usersessions)

Paths printed: sessionId, userId, zoneId, enteredAt, exitedAt, dwellSeconds, socketId, joinedAt, leftAt, totalDwellSeconds, zonesVisited, lastPositionX, lastPositionY, _id, createdAt, updatedAt, __v. Schema options: strict true, timestamps true.

    sessionId         String   required, trimmed, unique
    userId            String   required, trimmed, maxlength 120
    zoneId            String   required, trimmed, lowercase
    enteredAt         Date     required
    exitedAt          Date     default null, custom validator: must be >= enteredAt
    dwellSeconds      Number   default null
    socketId          String   trimmed, default null
    joinedAt          Date     default null (mirrors enteredAt)
    leftAt            Date     default null (mirrors exitedAt)
    totalDwellSeconds Number   default 0, min 0
    zonesVisited      array of { zoneId (required, trimmed, lowercase),
                             enteredAt (required Date), leftAt (Date, default null) },
                             no _id on entries, default empty array
    lastPositionX     Number   finite and within +-100000 when present
    lastPositionY     Number   finite and within +-100000 when present

The pairs joinedAt/leftAt/totalDwellSeconds and enteredAt/exitedAt/dwellSeconds exist because the task sheet names one set and the first implementation used the other; sessionHistory.js keeps both in sync.

## 4. Index reference

Index names below are the names MongoDB reported through collection.indexes() against a temporary in-memory database on 2026-11-10, after Model.init() created the indexes. The 2dsphere indexes report 2dsphereIndexVersion 3. Each collection also has the automatic _id_ index, which is not listed again.

    Collection    Index name                   Definition                                   Query pattern it serves
    ------------- ---------------------------- -------------------------------------------- ------------------------------------------
    users         userId_1                     { userId: 1 } unique                         lookup by business key, duplicate prevention,
                                                                                            profile reads and writes by userId
    users         location_2dsphere            { location: "2dsphere" }                     $near proximity queries that do not filter
                                                                                            status (proximityService.js)
    users         status_1_location_2dsphere   { status: 1, location: "2dsphere" }         $near queries that first filter by status
    officezones   zoneId_1                     { zoneId: 1 } unique                         lookup by zone key, duplicate zone rejection
    officezones   boundary_2dsphere            { boundary: "2dsphere" }                     $geoIntersects polygon containment
    usersessions  sessionId_1                  { sessionId: 1 } unique                      lookup by session key
    usersessions  zoneId_1_enteredAt_-1        { zoneId: 1, enteredAt: -1 }                 zone occupancy and per zone history, newest first
    usersessions  userId_1_enteredAt_-1        { userId: 1, enteredAt: -1 }                 per user history and dwell time, newest first
    usersessions  userId_1                     { userId: 1 } unique, partial where          at most one open session per user
                                               exitedAt is null

The partial unique index on userId where exitedAt is null exists so that a user can have any number of closed sessions but never two open ones at once; the database itself rejects a second open session.

The single field location 2dsphere index is retained on purpose. A $near query that does not filter by status cannot use the compound index, because status is its leading key, so proximityService.js still depends on the single field index. That is why scripts/migrateIndexes.js keeps it by default and drops it only when the --dropLegacy flag is passed (the drop flag is opt in).

Finding recorded while printing the schema indexes: models/UserSession.js declares sessionId unique both in the field definition (unique: true) and with UserSessionSchema.index({ sessionId: 1 }, { unique: true }). Mongoose prints "Duplicate schema index on {"sessionId":1}" when the model loads and the live database holds one index, sessionId_1. This is harmless but noisy and is a candidate for cleanup; it was not changed here.

## 5. ASCII ER diagram

    +--------------------------+      +--------------------------+
    | User                     |      | OfficeZone               |
    | collection: users        |      | collection: officezones  |
    |--------------------------|      |--------------------------|
    | userId (unique key)      |      | zoneId (unique key)      |
    | displayName              |      | name                     |
    | location (Point, 2dsph.) |      | type (enum)              |
    | canvasX, canvasY         |      | boundary (Polygon,2dsph.)|
    | status (enum)            |      | canvasBoundary (pixels)  |
    | lastSeenAt               |      | isSoundproof, isActive   |
    | avatarColor              |      | isSpotlightBroadcast     |
    | shirtSpriteId            |      +------------+-------------+
    | statusMessage            |                   ^
    +------------+-------------+                   |
                 ^                                 | zoneId (string)
                 | userId (string)                 |
                 |                    +------------+-------------+
                 +--------------------+ UserSession              |
                                      | collection: usersessions |
                                      |--------------------------|
                                      | sessionId (unique key)   |
                                      | userId                   |
                                      | zoneId                   |
                                      | enteredAt, exitedAt      |
                                      | dwellSeconds             |
                                      | zonesVisited[]           |
                                      +--------------------------+

    UserSession.userId -> User.userId           (many sessions per user)
    UserSession.zoneId -> OfficeZone.zoneId     (many sessions per zone)

These are logical relationships, not database enforced foreign keys. They link by shared identifier strings (userId and zoneId) and not by ObjectId references. This was chosen so a zone can be re-seeded or renamed without orphaning history, and so session history keeps its meaning if a user or zone document is recreated (source: the note on zoneId in INTEGRATION_CONTRACT.md). The cost is that MongoDB will not stop a session from naming a zone or user that does not exist; the application code must check.

## 6. Query reference

Proximity, function findUsersNearCanvasPoint in proximityService.js (the cached and guarded variants wrap it). Collection users. Operator $near with a GeoJSON $geometry Point and $maxDistance equal to pixelsToMetres(radiusPixels) plus a 1 metre candidate margin, then limit 50 and an exact Math.hypot check in canvas pixels as the final answer. Served by the single field index location_2dsphere. This is the query the benchmark and the load test time.

Polygon containment, functions listZones (with containsX and containsY) and findZonesContainingCanvasPoint in routes/zoneRoutes.js. Collection officezones. Operator $geoIntersects with a Point $geometry against boundary. Served by boundary_2dsphere. The result is then confirmed in canvas pixels by zoneContainsCanvasPoint in models/OfficeZone.js.

Zone occupancy and dwell aggregation, in sessionHistory.js. Collection usersessions. getZoneOccupancy runs a find on zoneId with exitedAt null and is served by zoneId_1_enteredAt_-1. getDwellTimeForUser runs a find on userId with exitedAt not null and an optional enteredAt range, served by userId_1_enteredAt_-1. getDwellTimeByZone runs an aggregate pipeline with $match, $group by zoneId (summing, averaging and counting dwellSeconds) and $sort by totalSeconds descending. Index use by the aggregate pipeline was not checked with explain: unverified.

Status filter plus distance query using the compound index. Collection users. Operator $near combined with an exact match on status (for example status "online"). It is not a text search; no $text operator exists anywhere in the code. No service function in this repository runs this query in production code: it is exercised and proven in scripts/migrateIndexes.js (the explain proof) and in Check 13 of verifyDb.js, where explain("executionStats") reported status_1_location_2dsphere as the winning index with keysExamined=3 and docsExamined=1. It is served by status_1_location_2dsphere.

## 7. Performance summary

Environment: in memory single node MongoDB on the same machine as the test client (a mongod child process started by mongodb-memory-server, 2026-11-10). Date of both runs: 2026-11-10.

Benchmark, command: npm run benchmark. benchmark.js has no in-memory mode of its own, so it ran against an in-memory single node MongoDB started with mongodb-memory-server on 127.0.0.1:27017 and filled with npm run seed (10 users). Query centre canvas (500, 500), radius 100 pixels, 5 warm-up runs, 35 measured iterations, 4 matches returned. All figures in milliseconds. This script does not report p99, throughput or an error count.

    Measurement                             min     median  mean(avg)  p95     p99          max
    --------------------------------------- ------- ------- ---------- ------- ------------ -------
    $near database query only               2.821   16.382  24.003     68.954  not reported 107.245
    full proximity service                  2.590   16.240  19.306     41.744  not reported 47.580

Load test, command: npm run loadtest -- --concurrency 100 --total 500. It started its own temporary in-memory database, seeded 300 avatars (about 25 percent inside the 100 pixel radius of the test point 500,400), re-seeded 4 times between waves, and completed 500 of 500 queries. Latencies in milliseconds.

    Measurement                              Value
    ---------------------------------------- -------------
    concurrency                              100
    total queries / completed                500 / 500
    wall clock ms (query waves only)         8669.858
    throughput, queries per second           57.7
    latency min                              261.290
    latency median                           1103.461
    latency mean                             1087.679
    latency p95                              1767.517
    latency p99                              1896.011
    latency max                              1919.313
    average matches per query                50.0
    errors                                   0

The load test script has a built in budget of p95 under 20 ms and that check printed FAIL in this run (p95=1767.517ms, budget=20ms); the error count and completion checks printed PASS. The budget was not loosened. Another run of the same command earlier in the same session gave throughput 63.6 queries per second, median 1021.010 ms, p95 1590.864 ms, p99 1675.522 ms and max 1766.185 ms, so run to run variation on this machine is real.

These figures measure the query layer on one machine and are not a production network measurement; a networked figure needs the Docker container in docker-compose.mongo.yml.

## 8. Verified checks

npm run verify:db runs verifyDb.js against a temporary in-memory MongoDB, prints one PASS or FAIL line per check, exits 0 only when every check passes, and drops its temporary database at the end. It printed PASS 15, FAIL 0 and exited 0 on 2026-11-10. The checks, by the names the harness prints:

    Check 1:  location 2dsphere index exists in live database
    Check 2:  seed idempotency (10 users after each run)
    Check 3:  proximity returns exactly four seed users
    Check 4:  boundary accepts 100px and rejects 100.5px
    Check 5:  excludeUserId removes the requesting user
    Check 6:  benchmark measured (min/median/avg/p95/max printed)
    Check 7:  pruning dryRun keeps 2 stale, dryRun false deletes 2
    Check 8:  office zone seeder writes 3, idempotent, containment and index verified
    Check 9:  zone route handlers create/list/contain/duplicate/malformed
    Check 10: session history occupancy and dwell time
    Check 11: nearby cache bridge two calls first db second cache
    Check 12: coordinate sanitization guard
    Check 13: compound status and 2dsphere index
    Check 14: test database dropped and memory server stopped
    Check 15: user profile avatar persistence

Check 15 is the fifteenth check, added with the user profile API. In the harness output its line is printed just before the Check 14 cleanup line, so the cleanup check is still the last line printed. The harness is reproducible with npm run verify:db and it drops its temporary database when it finishes.

## 9. Known limitations and open decisions

- The pixel to metre scale is still provisional at METRES_PER_PIXEL = 1 and is not confirmed by the team.
- Two proximity implementations exist across branches (this branch queries MongoDB with $near; the server branch has its own in-memory engine). The server side must pick one. See INTEGRATION_CONTRACT.md section 3.
- Redis caching on the server branch is not wired to this layer. services/nearbyCacheBridge.js is only an adapter: when the leader's services/spatialCache.js is absent (as it is on this branch) and no cache is injected, it caches nothing and every query goes to the database.
- No production cluster has been measured. All figures above come from an in-memory single node database on one machine.
- The load test p95 budget of 20 ms is not met by the in-memory run at concurrency 100 (see section 7).
- The status plus distance query has no service function yet; only the migration script and the harness exercise it.
- Whether the aggregate pipeline in getDwellTimeByZone uses an index: unverified.
