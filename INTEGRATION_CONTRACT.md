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