# Mid-Review Evidence

## Verification harness output

```
=== verifyDb.js: in-memory single-node MongoDB verification ===
All timings below come from an in-memory single-node MongoDB on this laptop and are not production latency figures.

PASS Check 1: location 2dsphere index exists in live database | indexes=[{"name":"_id_","key":{"_id":1}},{"name":"userId_1","key":{"userId":1}},{"name":"location_2dsphere","key":{"location":"2dsphere"}}]
MongoDB connected successfully
Connected to host: 127.0.0.1
Database name: test
Seed namespace prefix: seed:proxispeak:v1:
2dsphere index on location already exists.
Seed users inserted or updated: 10
bulkWrite result - upserted: 10 modified: 0
Users in seed namespace: 10
2dsphere index verified: true
Indexes: [
  {
    "name": "_id_",
    "key": {
      "_id": 1
    }
  },
  {
    "name": "userId_1",
    "key": {
      "userId": 1
    }
  },
  {
    "name": "location_2dsphere",
    "key": {
      "location": "2dsphere"
    }
  }
]
Database connection closed.
MongoDB connected successfully
Connected to host: 127.0.0.1
Database name: test
Seed namespace prefix: seed:proxispeak:v1:
2dsphere index on location already exists.
Seed users inserted or updated: 10
bulkWrite result - upserted: 0 modified: 0
Users in seed namespace: 10
2dsphere index verified: true
Indexes: [
  {
    "name": "_id_",
    "key": {
      "_id": 1
    }
  },
  {
    "name": "userId_1",
    "key": {
      "userId": 1
    }
  },
  {
    "name": "location_2dsphere",
    "key": {
      "location": "2dsphere"
    }
  }
]
Database connection closed.
PASS Check 2: seed idempotency (10 users after each run) | run1=10 run2=10
PASS Check 3: proximity returns exactly four seed users | returned=["seed:proxispeak:v1:seed-user-1","seed:proxispeak:v1:seed-user-2","seed:proxispeak:v1:seed-user-3","seed:proxispeak:v1:seed-user-4"]
PASS Check 4: boundary accepts 100px and rejects 100.5px | insideReturned=true outsideReturned=false
PASS Check 5: excludeUserId removes the requesting user | excluded=seed:proxispeak:v1:seed-user-1 remaining=3

Benchmark (in-memory single-node MongoDB on this laptop, not production latency):
  dataset size: 10 users
  match count: 4
  measured iterations: 30 (after 5 warm-up runs)
  Raw $near database query timing (ms):
  min: 6.473 ms
  median: 10.326 ms
  average: 10.467 ms
  p95: 13.239 ms
  max: 20.070 ms
  Full proximity service timing (ms):
  min: 7.160 ms
  median: 10.845 ms
  average: 10.741 ms
  p95: 13.059 ms
  max: 18.342 ms
PASS Check 6: benchmark measured (min/median/avg/p95/max printed) | fullServiceAvg=10.741ms under20ms=true
  Full service average is under 20 milliseconds.
PASS Check 7: test database dropped and memory server stopped | dropped

=== Summary ===
PASS: 7  FAIL: 0
All numbers above were measured on an in-memory single-node MongoDB on this laptop.
```

## Environment

v24.14.1
628c03d
The timings come from an in-memory single-node MongoDB and are not production latency figures.
