/**
 * Replay-style contract checks for milestone engine (run: npm run test:milestone).
 */
import assert from "node:assert/strict";
import {
  computeMilestoneProjection,
  fingerprintProjection,
  milestoneExcelPiecesHint,
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
  assert.equal(p.meta.paths_count, 1, "LY then TG excel must not fan out duplicate TLV→BKK edges");
  assert.equal(p.meta.max_pieces, 4);
  assert.match(p.meta.overall_status, /Received from Flight/i);
  const flow0 = p.flows_steps[0].filter(s => s.kind === "node") as { code: string; pieces?: string | null; flight?: string | null }[];
  const lyDep = flow0.find(n => n.code === "DEP" && n.flight === "LY0081");
  assert.ok(lyDep, "LY0081 DEP node");
  assert.equal(lyDep?.pieces, "4");
}

/** TG + Thai Cargo: successive DLV at destination shows 1 pc per line — final ground milestone should reflect shipment total (217-07891435 style). */
function testMultiplePartialDlvAtDestinationShowsConsolidatedPieceCount() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "RCS",
        status: "Received from Shipper",
        location: "TLV",
        date: "2026-04-21T11:42:00.000Z",
        pieces: "7",
        weight: "157",
        source: "airline",
      },
      {
        status_code: "BKD",
        status: "Booking Confirmed",
        location: "TLV",
        date: "2026-04-21T11:42:00.000Z",
        flight: "LY0081",
        pieces: "7",
        source: "airline",
      },
      {
        status_code: "BKD",
        status: "Booking Confirmed",
        location: "TLV",
        date: "2026-04-21T18:30:00.000Z",
        flight: "TG0325",
        pieces: "7",
        source: "airline",
      },
      {
        status_code: "DEP",
        status: "Departed",
        location: "TLV",
        date: "2026-04-21T21:20:00.000Z",
        flight: "LY0081",
        pieces: "7",
        weight: "157",
        source: "airline",
      },
      {
        status_code: "ARR",
        status: "Arrived",
        location: "BKK",
        date: "2026-04-22T14:00:00.000Z",
        flight: "LY0081",
        pieces: "7",
        source: "airline",
      },
      {
        status_code: "RCF",
        status: "Received from Flight",
        location: "BKK",
        date: "2026-04-22T13:33:00.000Z",
        flight: "LY0081",
        pieces: "4",
        source: "airline",
      },
      {
        status_code: "RCF",
        status: "Received from Flight",
        location: "BKK",
        date: "2026-04-22T13:33:00.000Z",
        flight: "LY0081",
        pieces: "3",
        source: "airline",
      },
      {
        status_code: "MAN",
        status: "Manifested",
        location: "BKK",
        date: "2026-04-23T19:14:00.000Z",
        flight: "TG0325",
        pieces: "7",
        source: "airline",
      },
      {
        status_code: "DEP",
        status: "Departed",
        location: "BKK",
        date: "2026-04-23T21:50:00.000Z",
        flight: "TG0325",
        pieces: "7",
        weight: "157",
        source: "airline",
      },
      {
        status_code: "RCF",
        status: "Received from Flight",
        location: "BLR",
        date: "2026-04-24T02:21:00.000Z",
        flight: "TG0325",
        pieces: "3",
        source: "airline",
      },
      {
        status_code: "RCF",
        status: "Received from Flight",
        location: "BLR",
        date: "2026-04-24T02:21:00.000Z",
        flight: "TG0325",
        pieces: "4",
        source: "airline",
      },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-24T22:07:00.000Z", pieces: "1", weight: "2", source: "airline" },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-25T12:53:00.000Z", pieces: "1", weight: "14", source: "airline" },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-25T12:53:00.000Z", pieces: "1", weight: "18", source: "airline" },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-25T12:54:00.000Z", pieces: "1", weight: "2", source: "airline" },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-25T12:54:00.000Z", pieces: "1", weight: "8", source: "airline" },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-25T12:59:00.000Z", pieces: "1", weight: "107", source: "airline" },
      { status_code: "DLV", status: "Delivered", location: "BLR", date: "2026-04-25T13:09:00.000Z", pieces: "1", weight: "6", source: "airline" },
    ],
    origin: "TLV",
    destination: "BLR",
    status: "Delivered",
    excelLegs: [
      { from: "TLV", to: "BKK", flight: "LY0081" },
      { from: "BKK", to: "BLR", flight: "TG0325" },
    ],
    excelPiecesHint: 7,
  });
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const terminalBlr = [...nodes].reverse().find(s => s.code === "DLV" && s.location === "BLR");
  assert.ok(terminalBlr, "expected terminal destination Ground service / DLV node at BLR");
  assert.equal(terminalBlr.pieces, "7", "must not inherit only latest partial DLV (1 pcs)");
}

function testHouseDeclarationCapsAirlineMawbRollupWhenOriginDocsAgreeWithHawbImport() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "RCS",
        source: "maman",
        status: "At warehouse",
        location: "TLV — Maman",
        date: "2026-04-20T10:00:00.000Z",
        pieces: "1",
      },
      {
        status_code: "DEP",
        location: "TLV",
        date: "2026-04-20T14:00:00.000Z",
        flight: "LY001",
        pieces: "5",
        weight: "100",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "JFK",
        date: "2026-04-21T08:00:00.000Z",
        flight: "LY001",
        pieces: "5",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "JFK",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1,
  });
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const dep = nodes.find(s => s.kind === "node" && s.code === "DEP");
  const arr = nodes.find(s => s.kind === "node" && s.code === "ARR");
  assert.equal(dep?.pieces, "1", "MAWB rollup on DEP must cap to HAWB import when no RCS/BKD at origin exceeds hint");
  assert.equal(arr?.pieces, "1");
  assert.equal(p.meta.max_pieces, 1);
}

/** When tracker raw_meta.pieces is MAWB rollup but ingest set excel_pieces_hint, cap still applies. */
function testExcelPiecesHintOverridesTrackerRollupForHouseCap() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "DEP",
        location: "TLV",
        date: "2026-04-20T14:00:00.000Z",
        flight: "LY001",
        pieces: "7",
        weight: "100",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "BLR",
        date: "2026-04-21T08:00:00.000Z",
        flight: "LY001",
        pieces: "7",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "BLR",
    status: null,
    excelLegs: [],
    excelPiecesHint: milestoneExcelPiecesHint({
      pieces: "7",
      excel_pieces_hint: 1,
    }),
  });
  const nodes = p.flows_steps[0].filter((s) => s.kind === "node");
  const dep = nodes.find((s) => s.code === "DEP");
  const arr = nodes.find((s) => s.code === "ARR");
  assert.equal(dep?.pieces, "1");
  assert.equal(arr?.pieces, "1");
  assert.equal(p.meta.max_pieces, 1);
}

/** Generic excel hint vs inflated origin RCS: keep trusting airline acceptance (noise guard). */
function testUntrustedExcelHintYieldsWhenOriginRcsExceedsHouse() {
  const shared = {
    events: [
      {
        status_code: "RCS",
        status: "Received from Shipper",
        location: "TLV",
        date: "2026-04-20T07:00:00.000Z",
        pieces: "5",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "TLV",
        date: "2026-04-20T14:00:00.000Z",
        flight: "LY001",
        pieces: "5",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "BLR",
        date: "2026-04-21T08:00:00.000Z",
        flight: "LY001",
        pieces: "5",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "BLR",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1 as const,
  };
  const p = computeMilestoneProjection(shared);
  const nodes = p.flows_steps[0].filter((s) => s.kind === "node");
  const dep = nodes.find((s) => s.code === "DEP");
  assert.equal(dep?.pieces, "5");
  assert.equal(p.meta.max_pieces, 5);
}

/** CargoGent excel_transport_lines-backed HAWB pieces must cap MAWB-inflated origin scans. */
function testTrustedHawbTransportExcelOverridesOriginRcsInflation() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "RCS",
        status: "Received from Shipper",
        location: "TLV",
        date: "2026-04-20T07:00:00.000Z",
        pieces: "5",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "TLV",
        date: "2026-04-20T14:00:00.000Z",
        flight: "LY001",
        pieces: "5",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "BLR",
        date: "2026-04-21T08:00:00.000Z",
        flight: "LY001",
        pieces: "5",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "BLR",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1,
    trustExcelHawbTransportPieces: true,
  });
  const nodes = p.flows_steps[0].filter((s) => s.kind === "node");
  const dep = nodes.find((s) => s.code === "DEP");
  const arr = nodes.find((s) => s.code === "ARR");
  assert.equal(dep?.pieces, "1");
  assert.equal(arr?.pieces, "1");
  assert.equal(p.meta.max_pieces, 1);
}

/** TG0325 with only bookings at hub must use excel BKK→BLR (not TLV→BKK from shipment origin). */
function testBkOnlyConnectingFlightUsesExcelEndpoints() {
  const p = computeMilestoneProjection({
    events: [
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
      {
        status_code: "BKD",
        status: "Booking Confirmed",
        location: "BKK",
        date: "2026-05-01T16:48:00.000Z",
        flight: "TG0325",
        pieces: "4",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "BLR",
    status: null,
    excelLegs: [
      { from: "TLV", to: "BKK", flight: "LY0081" },
      { from: "BKK", to: "BLR", flight: "TG0325" },
    ],
    excelPiecesHint: 1,
  });
  assert.equal(p.meta.paths_count, 1);
  const nodeFlights = p.flows_steps[0]
    .filter(s => s.kind === "node")
    .map(s => (s.kind === "node" ? s.flight : undefined))
    .filter((f): f is string => !!f);
  assert.ok(nodeFlights.includes("LY0081"), "expect LY leg");
  assert.ok(nodeFlights.includes("TG0325"), "expect TG planned leg");
}

function testBkOnlyHubFlightWithoutExcelFlightUsesHubToDestination() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "DEP", status: "Departed", location: "TLV", date: "2026-04-30T22:55:00.000Z", flight: "LY0081", pieces: "4", source: "airline" },
      { status_code: "ARR", status: "Arrived", location: "BKK", date: "2026-05-01T15:17:00.000Z", flight: "LY0081", pieces: "4", source: "airline" },
      { status_code: "RCF", status: "Received from Flight", location: "BKK", date: "2026-05-01T15:18:00.000Z", flight: "LY0081", pieces: "2", source: "airline" },
      { status_code: "BKD", status: "Booking Confirmed", location: "BKK", date: "2026-05-01T19:48:00.000Z", flight: "TG0325", pieces: "4", source: "airline" },
    ],
    origin: "TLV",
    destination: "BLR",
    status: null,
    excelLegs: [
      { from: "ILTLV", to: "THBKK" },
      { from: "THBKK", to: "INBLR" },
    ],
  });
  assert.equal(p.meta.paths_count, 1);
  const tgDep = p.flows_steps[0]
    .filter(s => s.kind === "node")
    .find(s => s.kind === "node" && s.code === "DEP" && s.flight === "TG0325");
  assert.equal(tgDep?.location, "BKK");
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

function testDestinationNfdAdvancesFinalGroundStep() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "BKD", status: "TLV TO HKG Request Received", location: "TLV", date: "2026-04-24T00:00:00.000Z", flight: "5C703", pieces: "4", source: "airline" },
      { status_code: "ARR", status: "Arrived", location: "HKG", date: "2026-04-24T04:41:00.000Z", flight: "K4701", pieces: "4", source: "airline" },
      { status_code: "RCT", status: "Freight Received from airline", location: "HKG", date: "2026-04-25T18:05:00.000Z", flight: "K4", pieces: "4", source: "airline" },
      { status_code: "DIS", status: "Discrepancy - Offload", location: "HKG", date: "2026-04-27T07:43:22.000Z", pieces: "4", source: "airline" },
      { status_code: "BKD", status: "HKG TO HAN Confirmed (allotment)", location: "HKG", date: "2026-04-28T13:08:00.000Z", flight: "CX049", pieces: "4", source: "airline" },
      { status_code: "DEP", status: "Departed", location: "HKG", date: "2026-04-28T13:08:00.000Z", flight: "CX049", pieces: "4", source: "airline" },
      { status_code: "ARR", status: "Arrived", location: "HAN", date: "2026-04-28T20:48:00.000Z", flight: "CX049", pieces: "4", source: "airline" },
      { status_code: "RCF", status: "Freight Accepted at Airport", location: "HAN", date: "2026-04-29T00:26:00.000Z", pieces: "4", source: "airline" },
      { status_code: "NFD", status: "Notified for Delivery", location: "HAN", date: "2026-04-29T00:26:00.000Z", pieces: "4", source: "airline" },
    ],
    origin: "TLV",
    destination: "HAN",
    status: "Notified for Delivery",
    excelLegs: [
      { from: "TLV", to: "ALA" },
      { from: "ALA", to: "HKG" },
      { from: "HKG", to: "HAN", flight: "CX049" },
    ],
    excelPiecesHint: 2,
  });
  assert.equal(p.meta.overall_status, "Notified for Delivery");
  assert.equal(p.meta.paths_count, 1, "terminal NFD should collapse phantom alternate paths");
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const activeNodes = nodes.filter(s => s.kind === "node" && s.active);
  assert.ok(activeNodes.length > 0, "NFD should leave a clear active milestone");
  assert.ok(
    activeNodes.every(s => s.kind === "node" && s.status_code === "NFD"),
    "after destination NFD, only the final destination ground-service milestone may be active",
  );
  assert.ok(
    !activeNodes.some(s => s.kind === "node" && s.code === "ARR" && s.location === "HAN"),
    "destination landing must not remain active after NFD",
  );
  const finalGround = nodes.find(s => s.kind === "node" && s.code === "NFD");
  assert.equal(finalGround?.status_code, "NFD");
  assert.equal(finalGround?.desc, "Notified for Delivery");
  assert.equal(finalGround?.active, true);
}

function testAirEuropaRctKeepsHubGroundActiveAndPlannedOnwardLeg() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "BKD", status: "Pdg Confirm", location: "TLV", date: "2026-04-29T00:00:00.000Z", flight: "LY395", pieces: "21", weight: "494", remarks: "Scheduled Leg: TLV-MAD", source: "airline" },
      { status_code: "RCT", status: "RCT", location: "MAD", date: "2026-04-29T13:55:00.000Z", pieces: "21", weight: "494", source: "airline" },
      { status_code: "BKD", status: "Booked", location: "MAD", date: "2026-05-02T00:00:00.000Z", flight: "UX057", pieces: "21", weight: "494", remarks: "Scheduled Leg: MAD-GRU", source: "airline" },
    ],
    origin: "TLV",
    destination: "GRU",
    status: "Booked",
    excelLegs: [
      { from: "TLV", to: "MAD", flight: "LY395" },
      { from: "MAD", to: "GRU", flight: "UX057" },
    ],
  });
  assert.equal(p.origin_display, "TLV");
  assert.equal(p.dest_display, "GRU");
  assert.equal(p.meta.paths_count, 1);
  assert.equal(p.meta.overall_status, "Booked");
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const transitMad = nodes.find(s => s.kind === "node" && s.code === "RCF" && s.location === "MAD");
  assert.equal(transitMad?.status_code, "RCT");
  assert.equal(transitMad?.active, true);
  const uxDep = nodes.find(s => s.kind === "node" && s.code === "DEP" && s.flight === "UX057");
  assert.ok(uxDep, "expected onward UX057 planned departure node");
  assert.equal(uxDep?.pieces, "21");
  const fakeGruArr = nodes.find(s => s.kind === "node" && s.code === "ARR" && s.location === "GRU" && s.status_code === "RCT");
  assert.equal(fakeGruArr, undefined, "RCT at MAD must not be projected as GRU landing");
}

function testEthiopianRemarksBuildFullTlVAddMaaRoute() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "BKD", status: "Booked", location: "TLV", date: "2026-04-28T16:51:00.000Z", flight: "ET419", pieces: "1", remarks: "1/1 Pcs | from TLV to ADD | on ET419", source: "airline" },
      { status_code: "DEP", status: "Departed", location: "TLV", date: "2026-04-29T14:29:00.000Z", flight: "ET419", pieces: "1", remarks: "1/1 Pcs | from TLV to ADD | on ET419", source: "airline" },
      { status_code: "RCF", status: "Received From Flight", location: "ADD", date: "2026-04-30T01:58:00.000Z", flight: "ET419", pieces: "1", remarks: "1/1 Pcs | from TLV to ADD | on ET419", source: "airline" },
      { status_code: "BKD", status: "Booked", location: "ADD", date: "2026-04-30T12:38:00.000Z", flight: "ET696", pieces: "1", remarks: "1/1 Pcs | from ADD to MAA | on ET696", source: "airline" },
      { status_code: "MAN", status: "Manifested on Flight", location: "ADD", date: "2026-04-30T17:21:00.000Z", flight: "ET3692", pieces: "1", remarks: "1/1 Pcs | from ADD to MAA | on ET3692", source: "airline" },
      { status_code: "DEP", status: "Departed on Flight", location: "ADD", date: "2026-04-30T23:30:00.000Z", flight: "ET3692", pieces: "1", remarks: "1/1 Pcs | from ADD to MAA | on ET3692", source: "airline" },
    ],
    origin: "TLV",
    destination: "MAA",
    status: "Departed on Flight",
    excelLegs: [
      { from: "ILTLV", to: "ETADD" },
      { from: "ETADD", to: "INMAA" },
    ],
  });
  assert.equal(p.dest_display, "MAA");
  assert.equal(p.meta.paths_count, 1);
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const transit = nodes.find(s => s.kind === "node" && s.code === "RCF" && s.location === "ADD");
  assert.equal(transit?.status_code, "RCF");
  const active = nodes.filter(s => s.kind === "node" && s.active);
  assert.ok(active.some(s => s.kind === "node" && s.code === "DEP" && s.flight === "ET3692"));
}

/** Ethiopian often puts segment only in status as "(ADD → EBB)" with pcs-only remarks — MAN must win header vs older hub RCF. */
function testEthiopianManifestParenArrowStatusWinsOverallAndScopesLeg() {
  const manifestLine = "Manifested on flight ET3811 (ADD → EBB)";
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "DEP",
        status: "Departed",
        location: "TLV",
        date: "2026-04-28T10:00:00.000Z",
        flight: "ET100",
        pieces: "1",
        remarks: "1/1 Pcs | from TLV to ADD | on ET100",
        source: "airline",
      },
      {
        status_code: "RCF",
        status: "Received From Flight",
        location: "ADD",
        date: "2026-04-29T10:00:00.000Z",
        flight: "ET100",
        pieces: "1",
        remarks: "1/1 Pcs | from TLV to ADD | on ET100",
        source: "airline",
      },
      {
        status_code: "MAN",
        status: manifestLine,
        location: "ADD",
        date: "2026-04-30T12:00:00.000Z",
        flight: "ET3811",
        pieces: "1",
        remarks: "1/1 Pcs",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "EBB",
    status: "In Transit",
    excelLegs: [],
  });
  assert.equal(p.meta.overall_status, manifestLine);
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  assert.ok(
    nodes.some(
      s =>
        s.kind === "node" &&
        s.code === "DEP" &&
        s.status_code === "MAN" &&
        s.active &&
        s.location === "ADD" &&
        s.flight === "ET3811",
    ),
    "expected active take-off step showing manifest for ADD→EBB",
  );
}

/** DHL ACS manifests often read "movement K4248 to LEJ" with scan only at origin — infer TLV→LEJ segment. */
function testDHLManifestMovementToBuildsTelAvivLeipzigLeg() {
  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "MAN",
        location: "TLV",
        date: "2026-04-25T12:21:00.000Z",
        flight: "K4248",
        remarks: "Manifested onto movement K4248 to LEJ",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "TLV",
        date: "2026-04-25T12:23:00.000Z",
        flight: "K4248",
        remarks: "Depart Facility",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "LEJ",
        date: "2026-04-25T15:11:00.000Z",
        flight: "K4248",
        remarks: "Arrived Facility",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "YMX",
    status: null,
    excelLegs: [],
  });
  assert.equal(p.meta.paths_count, 1, "movement … to DEST + scan location TLV must imply one TLV–LEJ leg");
  const flow = p.flows_steps[0].filter((s): s is typeof s & { kind: "node" } => s.kind === "node");
  const depNode = flow.find(s => s.code === "DEP");
  assert.ok(depNode, "DEP node");
  assert.equal(depNode.flight, "K4248");
  const arrNode = flow.find(s => s.code === "ARR" && s.location === "LEJ");
  assert.ok(arrNode, "LEJ landing must be attributable to MAN→DEP→ARR flight K4248");
}

/** Second-hub movement + generic DEP rows must stay on one itinerary (605-style multi-hop exporters). */


/** TLV→AUH (607…) after ATD while no AUH inbound scan yet — headline is segment-oriented, carrier-agnostic. */
function testAirborneInTransitCopyUsesLegEndpoints() {
  const ref = new Date("2026-05-02T15:00:00.000Z").getTime();
  const tlvDepEvents = [
    {
      status_code: "RCS",
      location: "Tel Aviv-Yafo (TLV)",
      date: "2026-05-01T06:00:00.000Z",
      pieces: "1",
      source: "airline",
    },
    {
      status_code: "DEP",
      location: "(TLV)",
      date: "2026-05-02T10:30:00.000Z",
      flight: "EY0987",
      remarks: "Segment: TLV to AUH. Service: FLIGHT.",
      pieces: "1",
      source: "airline",
    },
  ];

  const airborne = computeMilestoneProjection({
    events: [...tlvDepEvents],
    origin: "TLV",
    destination: "AUH",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1,
    referenceTimeMs: ref,
  });
  assert.equal(airborne.meta.overall_status, "Departed TLV, in transit to AUH");

  const landed = computeMilestoneProjection({
    events: [
      ...tlvDepEvents,
      {
        status_code: "ARR",
        location: "Abu Dhabi (AUH)",
        date: "2026-05-02T14:45:00.000Z",
        flight: "EY0987",
        pieces: "1",
        remarks: "Segment: TLV to AUH. Service: FLIGHT.",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "AUH",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1,
    referenceTimeMs: ref,
  });
  assert.match(landed.meta.overall_status, /arr/i);

  const futureDep = computeMilestoneProjection({
    events: [...tlvDepEvents],
    origin: "TLV",
    destination: "AUH",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1,
    referenceTimeMs: new Date("2026-05-02T08:00:00.000Z").getTime(),
  });
  assert.notEqual(futureDep.meta.overall_status, "Departed TLV, in transit to AUH");
}

function testDHLSecondHubDepartJoinsMovementWhenDepHasNoParsedSegment() {
  const manifest = "Manifested onto movement Q79824T to BHX";


  const departBlurb = "Depart Facility";


  const p = computeMilestoneProjection({
    events: [
      {
        status_code: "RCS",
        location: "Tel Aviv Gateway (TLV)",
        date: "2026-04-28T06:51:00.000Z",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "MAN",
        location: "TLV",
        flight: "K4248",
        date: "2026-04-29T15:56:00.000Z",
        remarks: "Manifested onto movement K4248 to LEJ",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "TLV",
        flight: "K4248",
        date: "2026-04-29T16:05:00.000Z",
        remarks: departBlurb,
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "LEJ",
        flight: "K4248",
        date: "2026-04-29T21:30:00.000Z",
        remarks: "Arrived Facility",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "MAN",
        location: "LEJ",
        flight: "K3333",
        date: "2026-04-30T01:35:00.000Z",
        remarks: "Manifested onto movement K3333 to EMA",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "LEJ",
        flight: "K3333",
        date: "2026-04-30T03:34:00.000Z",
        remarks: departBlurb,
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "EMA",
        flight: "K3333",
        date: "2026-04-30T04:43:00.000Z",
        remarks: "Arrived Facility",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "MAN",
        location: "EMA",
        flight: "Q79824T",
        date: "2026-05-01T00:08:00.000Z",
        remarks: manifest,
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "EMA",
        flight: "Q79824T",
        date: "2026-05-01T00:09:00.000Z",
        status: departBlurb,
        pieces: "1",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "BHX",
    status: null,
    excelLegs: [],


    excelPiecesHint: 1,
    referenceTimeMs: new Date("2026-05-02T12:00:00.000Z").getTime(),


  });



  assert.equal(p.meta.paths_count, 1, "single-piece multi-hop exporter must collapse to one path");



  assert.equal(p.meta.overall_status, "Departed EMA, in transit to BHX");


  const flows = (p.flows_steps[0] || []).filter(s => s.kind === "node");
  const bhDep = flows.find(s => s.code === "DEP" && s.location === "EMA" && s.date === "2026-05-01T00:09:00.000Z");


  assert.ok(bhDep, "EMA→BHX leg must expose latest DEP timestamp on the departing hub node");


  assert.equal(bhDep?.flight, "Q79824T");
}

/** TLV→PRG via LEJ: ACS posts SFM at hub after ARR — header must stay on scheduled onward, not "Arrived Facility". */
function testDhlScheduledMovementAfterHubArrWinsOverall() {
  const sfmLine = "Scheduled for Movement";
  const p = computeMilestoneProjection({
    events: [
      { status_code: "RCS", location: "TLV", date: "2026-04-29T06:51:00.000Z", pieces: "1", source: "airline" },
      {
        status_code: "MAN",
        location: "TLV",
        flight: "QY961",
        date: "2026-04-30T12:30:00.000Z",
        remarks: "Manifested onto movement QY961 to LEJ",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "DEP",
        location: "TLV",
        flight: "QY961",
        date: "2026-04-30T12:37:00.000Z",
        remarks: "Depart Facility",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "ARR",
        location: "LEJ",
        date: "2026-05-01T15:20:00.000Z",
        remarks: "Arrived Facility",
        pieces: "1",
        source: "airline",
      },
      {
        status_code: "SFM",
        location: "LEJ",
        date: "2026-05-02T06:45:00.000Z",
        status: sfmLine,
        remarks: sfmLine,
        pieces: "1",
        source: "airline",
      },
    ],
    origin: "TLV",
    destination: "PRG",
    status: null,
    excelLegs: [],
    excelPiecesHint: 1,
  });
  assert.equal(p.meta.paths_count, 1);
  assert.match(p.meta.overall_status, /scheduled/i);

  assert.ok(!/^arrived\b/i.test(p.meta.overall_status.trim()), "overall must not pick stale hub ARR text");
}

function testFlightlessInboundArrShowsLandingAfterMovementSegment() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "RCS", location: "TLV", date: "2026-04-28T06:51:00.000Z", source: "airline" },
      { status_code: "MAN", location: "TLV", date: "2026-04-29T15:56:00.000Z", flight: "MV1TOLEJ", source: "airline" },
      { status_code: "DEP", location: "TLV", date: "2026-04-29T16:05:00.000Z", flight: "MV1TOLEJ", source: "airline" },
      { status_code: "ARR", location: "LEJ", date: "2026-04-29T22:30:00.000Z", source: "airline" },
      { status_code: "MAN", location: "LEJ", date: "2026-04-30T01:35:00.000Z", flight: "MV2TOEMA", source: "airline" },
      { status_code: "DEP", location: "LEJ", date: "2026-04-30T03:34:00.000Z", flight: "MV2TOEMA", source: "airline" },
      { status_code: "ARR", location: "EMA", date: "2026-04-30T08:00:00.000Z", source: "airline" },
    ],
    origin: "TLV",
    destination: "EMA",
    status: "",
    excelLegs: [],
  });
  assert.equal(p.meta.paths_count, 1);
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const tlvLejLanding = nodes.find(s => s.kind === "node" && s.label === "Landing" && s.location === "LEJ");
  assert.ok(tlvLejLanding, "expected Landing at LEJ with ATA from flightless ARR tied to movement leg");
  assert.equal(tlvLejLanding!.date, "2026-04-29T22:30:00.000Z");
  assert.ok(tlvLejLanding!.done !== false);
}

function testCargoPalLatestDestinationAwdWinsOverTransitAwd() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "DEP", status: "Departed", location: "BKK", date: "2026-04-23T00:00:00.000Z", flight: "PR-737", pieces: "1", source: "airline" },
      { status_code: "ARR", status: "AWB Arrived", location: "MNL", date: "2026-04-23T00:00:00.000Z", flight: "PR-737", pieces: "1", source: "airline" },
      { status_code: "RCF", status: "Received from flight", location: "MNL", date: "2026-04-23T00:00:00.000Z", flight: "PR-737", pieces: "1", source: "airline" },
      { status_code: "AWD", status: "Documents Delivered", location: "MNL", date: "2026-04-23T00:00:00.000Z", flight: "PR-737", pieces: "1", source: "airline" },
      { status_code: "DEP", status: "Departed", location: "MNL", date: "2026-04-30T00:00:00.000Z", flight: "PR-209", pieces: "1", source: "airline" },
      { status_code: "RCF", status: "Received from flight", location: "MEL", date: "2026-04-30T00:00:00.000Z", flight: "PR-209", pieces: "1", source: "airline" },
      { status_code: "AWD", status: "Documents Delivered", location: "MEL", date: "2026-04-30T00:00:00.000Z", flight: "PR-209", pieces: "1", source: "airline" },
    ],
    origin: "TLV",
    destination: "MEL",
    status: "Documents Delivered",
    excelLegs: [
      { from: "TLV", to: "BKK" },
      { from: "BKK", to: "MNL" },
      { from: "MNL", to: "MEL" },
    ],
  });
  assert.equal(p.meta.paths_count, 1);
  assert.equal(p.meta.overall_status, "Documents Delivered");
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const finalGround = nodes.find(s => s.kind === "node" && s.active && s.status_code === "AWD");
  assert.equal(finalGround?.location, "MEL");
  assert.equal(finalGround?.desc, "Documents Delivered");
}

function testChallengeTwoDigitYearTimesPreserveLastLegSchedule() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "DEP", status: "Departed", location: "TLV", date: "30 Apr 26 11:41", flight: "ICL601", pieces: "1", remarks: "Segment: TLV to LGG. Service: FLIGHT.", source: "airline" },
      { status_code: "ARR", status: "Arrived", location: "LGG", date: "30 Apr 26 14:53", flight: "ICL601", pieces: "1", remarks: "Segment: TLV to LGG. Service: FLIGHT. Departure: 30 Apr 26 11:41", source: "airline" },
      { status_code: "BKD", status: "Booked", location: "LGG", date: "02 May 26 07:00", flight: "CHG561", pieces: "1", remarks: "Segment: LGG to ATL. Service: FLIGHT.", source: "airline" },
      { status_code: "RCF", status: "Scheduled", location: "ATL", date: "02 May 26 10:30", flight: "CHG561", pieces: "1", remarks: "Segment: LGG to ATL. Service: FLIGHT. Departure: 02 May 26 07:00", source: "airline" },
    ],
    origin: "TLV",
    destination: "ATL",
    status: "Scheduled",
    excelLegs: [
      { from: "ILTLV", to: "BELGG", etd: "2026-04-29T21:30:00.000Z" },
      { from: "BELGG", to: "USATL", eta: "2026-05-02T10:30:00.000Z" },
    ],
  });
  assert.equal(p.meta.paths_count, 1);
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const lastDep = nodes.find(s => s.kind === "node" && s.code === "DEP" && s.flight === "CHG561");
  const lastArr = nodes.find(s => s.kind === "node" && s.code === "ARR" && s.location === "ATL");
  assert.equal(lastDep?.date, "2026-05-02T04:00:00.000Z");
  assert.equal(lastArr?.excelEta, "2026-05-02T10:30:00.000Z");
}

function testEvaActualFlightsFillMultiHubRoute() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "RCS", status: "Ready for flight", location: "TLV (MAMAN)", date: "2026-04-12T21:06:51.000Z", flight: "LY67", pieces: "2", weight: "144.0", source: "maman" },
      { status_code: "DEP", status: "Departed", location: "BKK", date: "2026-04-16T15:11:00.000Z", flight: "BR0202", pieces: "6", weight: "194", remarks: "Segment: BKK to TPE. Service: FLIGHT.", source: "airline" },
      { status_code: "ARR", status: "Arrived", location: "TPE", date: "2026-04-16T19:49:00.000Z", flight: "BR0202", pieces: "6", weight: "194", remarks: "Segment: BKK to TPE. Service: FLIGHT. Departure: 2026-04-16T15:11:00", source: "airline" },
      { status_code: "DEP", status: "Departed", location: "TPE", date: "2026-04-17T12:45:00.000Z", flight: "BR0752", pieces: "6", weight: "194", remarks: "Segment: TPE to PVG. Service: FLIGHT.", source: "airline" },
      { status_code: "ARR", status: "Arrived", location: "PVG", date: "2026-04-17T14:38:00.000Z", flight: "BR0752", pieces: "6", weight: "194", remarks: "Segment: TPE to PVG. Service: FLIGHT. Departure: 2026-04-17T12:45:00", source: "airline" },
    ],
    origin: "TLV",
    destination: "PVG",
    status: "Arrived",
    excelLegs: [
      { from: "ILTLV", to: "THBKK" },
      { from: "THBKK", to: "TWTPE" },
      { from: "TWTPE", to: "CNPVG", eta: "2026-04-17T20:00:00.000Z" },
    ],
  });
  assert.equal(p.dest_display, "PVG");
  assert.equal(p.meta.paths_count, 1);
  assert.equal(p.meta.overall_status, "Arrived");
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  assert.ok(nodes.some(s => s.kind === "node" && s.code === "ARR" && s.location === "BKK"), "expected planned TLV→BKK Excel leg");
  assert.ok(nodes.some(s => s.kind === "node" && s.code === "DEP" && s.flight === "BR0202"));
  assert.ok(nodes.some(s => s.kind === "node" && s.code === "DEP" && s.flight === "BR0752"));
  const pvgArr = nodes.find(s => s.kind === "node" && s.code === "ARR" && s.location === "PVG");
  assert.equal(pvgArr?.status_code, "ARR");
  assert.equal(pvgArr?.date, "2026-04-17T14:38:00.000Z");
  const active = nodes.filter(s => s.kind === "node" && s.active);
  assert.ok(active.every(s => s.kind === "node" && s.location === "PVG"));
}

function testSilkWayReturnToOriginUsesDeliveredLocationAsDestination() {
  const p = computeMilestoneProjection({
    events: [
      { status_code: "RCS", location: "MXP", date: "2026-02-12T18:34:00.000Z", source: "airline" },
      { status_code: "DEP", location: "MXP", date: "2026-02-28T03:12:10.000Z", flight: "7L276", source: "airline" },
      { status_code: "AA", location: "GYD", date: "2026-02-28T06:02:00.000Z", flight: "7L276", source: "airline" },
      { status_code: "DEP", location: "GYD", date: "2026-04-24T08:40:41.000Z", flight: "7L275", source: "airline" },
      { status_code: "RCF", location: "MXP", date: "2026-04-24T08:46:45.000Z", flight: "7L275", source: "airline" },
      { status_code: "DLV", location: "MXP", date: "2026-04-24T09:49:33.000Z", source: "airline" },
    ],
    origin: "MXP",
    destination: "MXP",
    status: "DLV",
    excelLegs: [],
  });
  assert.equal(p.origin_display, "MXP");
  assert.equal(p.dest_display, "MXP");
  assert.equal(p.meta.overall_status, "Delivered to origin");
  const nodes = p.flows_steps[0].filter(s => s.kind === "node");
  const finalGround = nodes.find(s => s.kind === "node" && s.active && s.status_code === "DLV");
  assert.equal(finalGround?.location, "MXP");
}

try {
  testEmptyLikeRoute();
  testSimpleDepArrDlvPath();
  testSinglePieceHintCollapsesMultiPath();
  testExcelOneHintDoesNotCollapseWhenAirlineShowsFourPcs();
  testLyHubTransferUsesLatestAirlineStatusAndLegCoalescedPcs();
  testMultiplePartialDlvAtDestinationShowsConsolidatedPieceCount();
  testHouseDeclarationCapsAirlineMawbRollupWhenOriginDocsAgreeWithHawbImport();
  testExcelPiecesHintOverridesTrackerRollupForHouseCap();
  testUntrustedExcelHintYieldsWhenOriginRcsExceedsHouse();
  testTrustedHawbTransportExcelOverridesOriginRcsInflation();
  testBkOnlyConnectingFlightUsesExcelEndpoints();
  testBkOnlyHubFlightWithoutExcelFlightUsesHubToDestination();
  testFingerPrintStableAcrossTwoCalls();
  testZeroPiecesWithoutUnloadSignalKeepsPath();
  testDestinationNfdAdvancesFinalGroundStep();
  testAirEuropaRctKeepsHubGroundActiveAndPlannedOnwardLeg();
  testEthiopianRemarksBuildFullTlVAddMaaRoute();
  testEthiopianManifestParenArrowStatusWinsOverallAndScopesLeg();
  testDHLManifestMovementToBuildsTelAvivLeipzigLeg();

  testAirborneInTransitCopyUsesLegEndpoints();
  testDHLSecondHubDepartJoinsMovementWhenDepHasNoParsedSegment();
  testDhlScheduledMovementAfterHubArrWinsOverall();

  testFlightlessInboundArrShowsLandingAfterMovementSegment();

  testCargoPalLatestDestinationAwdWinsOverTransitAwd();
  testChallengeTwoDigitYearTimesPreserveLastLegSchedule();
  testEvaActualFlightsFillMultiHubRoute();
  testSilkWayReturnToOriginUsesDeliveredLocationAsDestination();
  console.log("[milestoneEngine.contract.test] OK");
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
