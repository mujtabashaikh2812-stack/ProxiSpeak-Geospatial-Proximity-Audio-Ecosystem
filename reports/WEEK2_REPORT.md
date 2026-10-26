# Week 2 Report

## What I built

Three commits on dev-kuldeep, 699 new lines across 14 files: the $near proximity service that decides the 100-pixel earshot rule with an exact pixel comparison after the 2dsphere index narrows the candidates; verifyDb.js, a seven-check harness that starts a temporary in-memory MongoDB so the database behaviour can be proven on any machine; a real integration test suite replacing three placeholders that only asserted true; and INTEGRATION_CONTRACT.md, which records the shared field names and the open decisions instead of leaving them in chat.

## What I fixed

A displayName field was being silently stripped by strict schema mode, so seeded names saved as nothing. The seed script depended on transactions, which a standalone MongoDB rejects, so it would have failed on any normal laptop. Coordinate rounding could move a point by about eleven centimetres, enough to lose a user sitting exactly on the 100-pixel line, so I added a one metre margin that widens only the candidates and never the final answer. The .env file was documented but never read, and the test command could not run at all.

## Blockers

No MongoDB on my machine blocked every Week 2 claim, resolved with an in-memory server kept strictly in devDependencies. Two proximity engines now exist, one in memory in the server branch and one in mine; both enforce 100 pixels so their results agree, but they disagree about where the truth should live, and that decision belongs to the team. The running server still never connects to MongoDB, and package.json and .env.example still conflict on merge.

## Learnings

The harness reports seven passes and the suite reports 36 passing, and the lookup averages about 1.7 milliseconds against a target of 20. But those milliseconds come from ten documents in a temporary database on one laptop, so the target has been assessed, not achieved. An index does not make a decision, and a skip is not a pass. Because there is a difference between a check that passes and a claim that is true, and only the second one survives when someone else runs my work.
