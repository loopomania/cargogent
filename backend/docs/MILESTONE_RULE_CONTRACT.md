# Milestone interpretation rule contract

This document is the canonical product-facing contract for how air cargo tracking events become the **milestone timeline** returned in `milestone_projection`. Scheduling intervals and halt logic belong to **schedule/policy** versioning (`SCHEDULE_POLICY_VERSION`), not milestone projection versioning.

## Versioning

- **Milestone**: `milestone_projection_version` (semver string, see `backend/src/services/milestoneVersions.ts`). Bump when projection output meaning changes for the same underlying `events[]`.
- **Schedule / policy**: `schedule_policy_version`. Bump only when persistence of `next_status_check_at`, error halt, staleness alerting, etc. changes in ways operators care about.

## Precedence and inputs

1. Events are normalized to ISO timestamps by `normalizeEventDate()` before projection (same as ingestion).
2. **Ground vs airline**: Ground handlers are detected by `source in ('maman','swissport')` or location substring `MAMAN` / `Swissport`; those events are excluded from **airline-only** leg building when airline events exist, matching prior UI behavior.
3. Excel legs (`raw_meta.excel_legs`): merged when they add `(from,to)` pairs not inferred from tracker; used for ETA/ETD overlays and phantom-leg repair (single-hop legs extended using Excel corridor).
4. **Flow pruning**:
   - Drop flows where every event on each leg carries `pieces` parsed as numeric `0` (unloaded / no cargo paths).
   - If the shipment has any transit-like codes globally (`DEP|ARR|MAN|RCF`), drop flows that have no transit-like code on any leg event (suppress “ground-only phantom” alternate paths).

## Leg building (summary)

1. Prefer segment-based pairing via `remarks` (`Segment: X to Y`, `Departure:`).
2. Else group chronologically per **normalized flight number**; split instances when cycle resets (MAN/DEP after ARR suggests new rotation).
3. Derive geographic path from DEP/ARR location sequences; incomplete single-city paths extended using Excel legs or declared destination.
4. Merge unmatched Excel `(from,to)` segments.
5. Fallback: chronological DEP-based city path origin→destination.
6. **`flightMatch` normalization**: airline event `flight` is compared to leg `flightNo` using **`normalizeFlight()`** (carrier + digits collapsed) so `LY 012` ≡ `LY12`.

## Timeline steps (one horizontal flow)

For each retained flow, emit an ordered array of **`arrow`** and **`node`** primitives:

1. Origin ground node (`RCS`-style UX) from pre-DEP acceptance codes (`BKD, RCS, FOH, DIS, 130`).
2. Per leg: arrow → DEP (take-off) → arrow → ARR (landing).
3. Between legs (transit ground): arrow → intermediate ground (`RCF` UX) — **take-off-done for next segment** follows **next flight’s DEP** on that flow (scoped), not globally.
4. After last leg: arrow → destination DLV/`AWD` node.

`done` / `active` flags mirror legacy UI semantics so visual regression is minimized.

## Trace field

`interpretation_trace` is a short bullet list for support (e.g. `ground_split`, `excel_fallback_origin`, `prune:no_transit_in_flow`). It is diagnostic only—not a substitute for versioning.

## Operational environment flags

| Variable | Effect |
|---------|--------|
| `SKIP_ENRICH_MILESTONE=1` | API skips live recompute on read paths; persisted `summary.milestone_projection` is surfaced when enrichment is skipped. Emergency rollback lever. |
| `MILESTONE_SHADOW_LOG=1` | Prints a deterministic fingerprint (`fingerprintProjection`) to stdout/logs on each computation for diffing deploys without changing UI behavior. |

**Rollout observability**: when New Relic is loaded, successful enrich calls record `Custom/MilestoneProjection/Flows` (value = number of parallel paths retained after pruning).
