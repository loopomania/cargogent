/**
 * TAP routing helpers (run: npm run test:tap)
 */
import assert from "node:assert/strict";
import {
  augmentEventsWithTapRouting,
  parseTapDdMonYy,
  pruneSupersededTapBkds,
  type TapRoutingLine,
} from "../services/tapCargoRouting.js";

function testParsesTapDdMonYy() {
  assert.equal(parseTapDdMonYy("30APR26"), "2026-04-30T12:00:00.000Z");
  assert.equal(parseTapDdMonYy("02MAY26", "20:00"), "2026-05-02T20:00:00.000Z");
  assert.equal(parseTapDdMonYy("04MAY26", "08:00"), "2026-05-04T08:00:00.000Z");
  assert.ok(!parseTapDdMonYy(""));
}

function testPrunesAlternateTpFreighter() {
  const lines: TapRoutingLine[] = [
    { FlightOrigin: "CDG", FlightDest: "LIS", FlightNum: "TP4000F", FlightDate: "02MAY26" },
  ];
  const out = pruneSupersededTapBkds(
    [
      { status_code: "BKD", flight: "TP4002F", location: "PAR" },
      { status_code: "BKD", flight: "TP4000F", location: "PAR" },
    ],
    lines,
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].flight, "TP4000F");
}

function testAugmentsDepartureOntoBkds() {
  const lines: TapRoutingLine[] = [
    { FlightOrigin: "TLV", FlightDest: "CDG", FlightNum: "LY323", FlightDate: "30APR26" },
    {
      FlightOrigin: "CDG",
      FlightDest: "LIS",
      FlightNum: "TP4000F",
      DepartureDate: "02MAY26",
      DepartureTime: "20:00",
      ArrivalDate: "03MAY26",
      ArrivalTime: "20:00",
    },
  ];
  const ev = [
    { status_code: "BKD", flight: "LY323", location: "TLV", date: "2026-04-29T07:00:00.000Z" },
    { status_code: "BKD", flight: "TP4000F", location: "CDG", date: "2026-04-29T07:00:00.000Z" },
  ] as Record<string, string | undefined>[];

  augmentEventsWithTapRouting(ev, lines);

  assert.equal(ev[0].departure_date, "2026-04-30T12:00:00.000Z");
  assert.equal(ev[1].departure_date, "2026-05-02T20:00:00.000Z");
  assert.ok(ev[1].arrival_date?.startsWith("2026-05-03T20"));
}

try {
  testParsesTapDdMonYy();
  testPrunesAlternateTpFreighter();
  testAugmentsDepartureOntoBkds();
  console.log("[tapCargoRouting.test] OK");
  process.exit(0);
} catch (e) {
  console.error(e);
  process.exit(1);
}
