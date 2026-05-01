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

function testSinglePieceHintCollapsesMultiPath() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "BKD", flight: "LY323", location: "(TLV)", date: "2026-04-30T08:00:00.000Z", source: "air", pieces: "1" },
      { status_code: "BKD", flight: "TP4000F", location: "PAR", date: "2026-05-01T10:00:00.000Z", source: "air", pieces: "1" },
      { status_code: "BKD", flight: "TP780", location: "LIS", date: "2026-05-03T08:00:00.000Z", source: "air", pieces: "1" },
    ],
    origin: "TLV",
    destination: "ARN",
    status: null,
    excelLegs: [
      { from: "TLV", to: "CDG", flight: "LY323" },
      { from: "CDG", to: "LIS", flight: "TP4000F" },
      { from: "LIS", to: "ARN", flight: "TP780" },
      { from: "TLV", to: "ORY", flight: "XX123" },
    ],
    excelPiecesHint: 1,
  });
  assert.equal(p.meta.paths_count, 1, "single piece must not show parallel phantom paths");
  assert.ok(
    p.interpretation_trace.some(t => t.startsWith("collapse:single_piece_")),
    "trace should record single-piece collapse",
  );
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
  testSinglePieceHintCollapsesMultiPath();
  testFingerPrintStableAcrossTwoCalls();
  console.log("[milestoneEngine.contract.test] OK");
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
