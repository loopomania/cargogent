/**
 * Replay-style contract checks for milestone engine (run: npm run test:milestone).
 */
import assert from "node:assert/strict";
import {
  computeMilestoneProjection,
  fingerprintProjection,
} from "../services/milestoneEngine.js";
import { MILESTONE_PROJECTION_VERSION } from "../services/milestoneVersions.js";

function testEmptyLikeRoute() {
  const p = computeMilestoneProjection({
    events: [],
    origin: "TLV",
    destination: "JFK",
    status: null,
    excelLegs: [],
  });
  assert.equal(p.origin_display, "TLV");
  assert.equal(p.dest_display, "JFK");
  assert.match(p.milestone_projection_version, /^\d+\.\d+\.\d+$/);
  assert.ok(Array.isArray(p.flows_steps));
  assert.ok(fingerprintProjection(p).length > 0);
}

function testSimpleDepArrDlvPath() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "RCS",
        location: "Tel Aviv-Yafo (TLV)",
        date: "2026-03-01T08:00:00.000Z",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "TLV Airport (TLV)",
        date: "2026-03-01T14:00:00.000Z",
        flight: "LY001",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "JFK (JFK)",
        date: "2026-03-01T23:00:00.000Z",
        flight: "LY001",
        source: "airline",
      },
      {
        status_code: "DLV",
        location: "JFK (JFK)",
        date: "2026-03-02T01:00:00.000Z",
        pieces: "3",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "JFK",
    status: null,
    excelLegs: [],
  });
  const flow0 = p.flows_steps[0];
  assert.ok(flow0.length > 6, "expects origin + dep + arr + … + delivery");
  const codes = flow0.filter(s => s.kind === "node").map(s => s.code);
  assert.ok(codes.includes("DEP"));
  assert.ok(codes.includes("DLV"));
  assert.equal(MILESTONE_PROJECTION_VERSION, p.milestone_projection_version);
}

function testFingerPrintStableAcrossTwoCalls() {
  const input = {
    events: [{ status_code: "RCS", location: "(TLV)", date: "2026-03-01T08:00:00.000Z", source: "airline" }],
    origin: "TLV",
    destination: "JFK",
    status: null,
    excelLegs: [] as { from?: string; to?: string }[],
  };
  const a = fingerprintProjection(computeMilestoneProjection(input));
  const b = fingerprintProjection(computeMilestoneProjection(input));
  assert.equal(a, b);
}

try {
  testEmptyLikeRoute();
  testSimpleDepArrDlvPath();
  testFingerPrintStableAcrossTwoCalls();
  console.log("[milestoneEngine.contract.test] OK");
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
