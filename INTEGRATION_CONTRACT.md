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

Versions pinned on this branch (`dev-kuldeep`):

- express ^5.3.0 (resolved 5.3.0)
- mongoose ^9.11.2 (resolved 9.11.2)
- mongodb-memory-server ^11.3.0 (dev only)

The server branch pins its own versions in its own `package-lock.json`. One
`package-lock.json` cannot satisfy both sides. The team must agree on versions
before merging. No winner is chosen here.

## 5. `.env.example` overlap

Variables needed by this branch:

- `MONGODB_URI` - MongoDB connection URI (local fallback is `mongodb://127.0.0.1:27017/procsispeak`)
- `SEED_DB` - set to `development` to allow the seed script to run

The server branch needs its own variables, which are not visible from this
branch. They must be taken from that branch's own `.env.example` before merge.
A merged `.env.example` must contain all variables from both sides.