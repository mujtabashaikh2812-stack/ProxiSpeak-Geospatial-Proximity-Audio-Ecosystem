# ProxiSpeak Integration Contract

This document records the cross-branch decision surface. It does not decide anything.

## 1. Distance unit

Canvas pixels are the authoritative distance unit. Two users can hear each other
when they are within 100 canvas pixels of each other.

The proximity service enforces this with an exact `Math.hypot` comparison on the
`canvasX` and `canvasY` fields after MongoDB `$near` candidate retrieval. The
`<= radiusPixels` check is the final arbiter; nothing is widened or narrowed by
the candidate margin.

The GeoJSON `location` Point exists only so MongoDB can index and prefilter the
candidate set. `METRES_PER_PIXEL` in `canvasToGeo.js` is a storage detail, not a
product decision. It is currently 1 (provisional) and must not be read as a
spec.

## 2. Field names

Every document uses these field names, and the server and audio branches already
use the same names:

- `userId` - unique string identifier
- `canvasX` - horizontal canvas pixel coordinate
- `canvasY` - vertical canvas pixel coordinate
- `location` - a GeoJSON Point with `longitude` first: `{ type: 'Point', coordinates: [longitude, latitude] }`

## 3. Two proximity implementations

Two proximity implementations now exist and the team must pick one as the
source of truth before any merge.

- In-memory (server branch): computes `Math.hypot` over `canvasX` and `canvasY`
  directly. It is simpler and needs no database, but it does not persist user
  positions and cannot scale past one process.
- MongoDB-backed (this branch): uses a `2dsphere` index and a `$near` query for
  candidate retrieval, then applies the exact canvas filter. It is index-backed
  and persistent, but it adds a database dependency and a network hop.

This branch never connects to MongoDB at runtime unless the team chooses the
MongoDB implementation.

## 4. Dependency conflict warning

This branch now pins mongoose ^8.9.5 to match the server branch, and express has
been removed from this branch's dependencies because no file on this branch
requires it. The remaining difference is that the server branch additionally
needs socket.io, cors and dotenv.

package.json and .env.example still conflict on merge because both sides add
them. The lead resolves that in his own branch, not this one.

## 5. `.env.example` overlap

Variables needed by this branch:

- `MONGODB_URI` - MongoDB connection URI (local fallback is `mongodb://127.0.0.1:27017/procsispeak`)
- `SEED_DB` - set to `development` to allow the seed script to run

Variables needed by the server branch, taken from that branch's own
`.env.example`:

- `PORT` - Express listen port, default 5000
- `NODE_ENV` - runtime environment, default development
- `CLIENT_ORIGIN` - comma-separated list of allowed client origins, default
  `http://localhost:5173,http://localhost:3000`
- `EARSHOT_RADIUS_PIXELS` - canvas pixel earshot radius, default 100
- `MAX_PEERS_PER_ZONE` - maximum peers per spatial zone, default 20

A merged `.env.example` must contain all variables from both sides.
## Session history

Model: UserSession. Fields: sessionId (String, required, unique), userId (String, required, max 120), zoneId (String, required, lowercase stable string id not ObjectId), enteredAt (Date, required), exitedAt (Date, optional, default null), dwellSeconds (Number, optional, default null), lastPositionX/lastPositionY (Number, optional, finite, within MAX_CANVAS_COORD). Timestamps true.

Indexes: sessionId unique; compound zoneId asc + enteredAt desc; compound userId asc + enteredAt desc; partial unique on userId with partialFilterExpression { exitedAt: null } so one user cannot hold two open sessions at once.

zoneId is a stable string identifier rather than an ObjectId reference so a zone can be re-seeded or renamed without orphaning history.

Functions: openSession, closeSession, getZoneOccupancy, getDwellTimeForUser, getDwellTimeByZone.

Session history sheet fields: socketId, joinedAt, leftAt, totalDwellSeconds, zonesVisited. Helpers: recordZoneEntry(userId, zoneId), recordZoneExit(userId, zoneId). joinedAt and leftAt mirror enteredAt and exitedAt and are kept in sync by sessionHistory.js.

Nearby cache bridge: services/spatialCache.js belongs to the leader and is not duplicated. services/nearbyCacheBridge.js is the adapter. It is a no-op while his file is absent. After merge his cache is the only cache and the bridge activates against it with no further change.

Coordinate sanitization: room bounds 0 to 1200 by 0 to 800, distinct from MAX_CANVAS_COORD 100000. Exported functions: validateCanvasCoordinate, validateCanvasPoint, sanitizeGeoJSONPoint, validateRadiusPixels, validateNearbyRequest, asMiddleware. Bad input returns 400. The middleware never imports express so it mounts on the lead's server unchanged.

## Index migration

Users now carry a status field (online, idle, offline; default offline) and a compound index { status: 1, location: '2dsphere' } for queries that filter by status and then search by distance. Status was added because it did not exist and the compound index needs it as its leading key. The single field location index is kept by default. Commands: node scripts/migrateIndexes.js, node scripts/migrateIndexes.js --memory and node scripts/migrateIndexes.js --dropLegacy. The drop flag is opt in because proximity queries that do not filter status still rely on the single field index.

## User profile API

routes/userRoutes.js adds GET /api/db/users/:id (getUserProfile) and PUT /api/db/users/:id/avatar (updateUserAvatar), where :id is the User userId string and the Mongo _id is only a fallback when the string is a valid ObjectId. User gains three optional fields: avatarColor (hash plus six hex digits, default null), shirtSpriteId (at most 64 characters, default null) and statusMessage (at most 140 characters, default empty). A blank id, an empty payload, a bad colour or an over long text field returns 400 naming the field; an unknown user returns 404. getProfilesForUsers(userIds) is the batch call for the roster: at most 100 ids, returns { count, users } sorted by userId. The handlers are framework free and mount on the lead's Express server through registerUserRoutes without edits.
