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

function testExcelOneHintDoesNotCollapseWhenAirlineShowsFourPcs() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "BKD", flight: "LY323", location: "(TLV)", date: "2026-04-30T08:00:00.000Z", source: "air", pieces: "4" },
      { status_code: "BKD", flight: "TP4000F", location: "PAR", date: "2026-05-01T10:00:00.000Z", source: "air", pieces: "4" },
      { status_code: "BKD", flight: "TP780", location: "LIS", date: "2026-05-03T08:00:00.000Z", source: "air", pieces: "4" },
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
  assert.ok(
    !p.interpretation_trace.some(t => t.startsWith("collapse:single_piece_")),
    "excel pieces=1 must not collapse when airline events show >1 pcs",
  );
}

function testLyHubTransferUsesLatestAirlineStatusAndLegCoalescedPcs() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "RCS",
        source: "maman",
        status: "At warehouse",
        location: "TLV — Maman",
        date: "2026-04-29T06:00:00.000Z",
        pieces: "1",
      },
      {
        status_code: "BKD",
        status: "Booking Confirmed",
        location: "TLV",
        date: "2026-04-29T07:32:00.000Z",
        flight: "LY0081",
        pieces: "4",
        source: "airline",
      },
      {
        status_code: "BKD",
        status: "Booking Confirmed",
        location: "BKK",
        date: "2026-04-29T15:41:00.000Z",
        flight: "TG0325",
        pieces: "4",
        source: "airline",
      },
      {
        status_code: "RCS",
        status: "Received from Shipper",
        location: "TLV",
        date: "2026-04-30T07:31:00.000Z",
        pieces: "4",
        source: "airline",
      },
      {
        status_code: "DEP",
        status: "Departed",
        location: "TLV",
        date: "2026-04-30T19:55:00.000Z",
        flight: "LY0081",
        pieces: "4",
        source: "airline",
      },
      {
        status_code: "ARR",
        status: "Arrived",
        location: "BKK",
        date: "2026-05-01T08:17:00.000Z",
        flight: "LY0081",
        pieces: "4",
        source: "airline",
      },
      {
        status_code: "RCF",
        status: "Received from Flight",
        location: "BKK",
        date: "2026-05-01T08:18:00.000Z",
        flight: "LY0081",
        pieces: "2",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "BLR",
    status: "Ready for flight",
    excelLegs: [
      { from: "TLV", to: "BKK", flight: "LY0081" },
      { from: "BKK", to: "BLR", flight: "TG0325" },
    ],
    excelPiecesHint: 1,
  });
  assert.equal(p.meta.max_pieces, 4);
  assert.match(p.meta.overall_status, /Received from Flight/i);
  const flow0 = p.flows_steps[0].filter(s => s.kind === "node") as { code: string; pieces?: string | null; flight?: string | null }[];
  const lyDep = flow0.find(n => n.code === "DEP" && n.flight === "LY0081");
  assert.ok(lyDep, "LY0081 DEP node");
  assert.equal(lyDep?.pieces, "4");
}

function testZeroPiecesWithoutUnloadSignalKeepsPath() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "DEP",
        status: "Departed",
        location: "TLV",
        date: "2026-04-24T05:56:00.000Z",
        flight: "K4",
        pieces: "0",
        source: "airline",
      },
      {
        status_code: "ARR",
        status: "Arrived",
        location: "HKG",
        date: "2026-04-24T18:30:00.000Z",
        flight: "K4",
        pieces: "0",
        source: "airline",
      },
      {
        status_code: "NFD",
        status: "Notified for Delivery",
        location: "HAN",
        date: "2026-04-25T08:00:00.000Z",
        pieces: "0",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "HAN",
    status: "Notified for Delivery",
    excelLegs: [],
  });
  assert.ok(p.meta.paths_count >= 1, "zero pieces without unload signal should not remove all paths");
}

try {
  testEmptyLikeRoute();
  testSimpleDepArrDlvPath();
  testSinglePieceHintCollapsesMultiPath();
  testExcelOneHintDoesNotCollapseWhenAirlineShowsFourPcs();
  testLyHubTransferUsesLatestAirlineStatusAndLegCoalescedPcs();
  testFingerPrintStableAcrossTwoCalls();
  testZeroPiecesWithoutUnloadSignalKeepsPath();
  console.log("[milestoneEngine.contract.test] OK");
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
