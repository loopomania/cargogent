const flow = [
  {
    from: "FRA", to: "TLV", flightNo: "LY 0810",
    events: [
      { status_code: "DEP", pieces: "0" },
      { status_code: "ARR", pieces: "0" },
      { status_code: "DIS", pieces: "0" }
    ]
  }
];

const hasZero = flow.some(leg => leg.events && leg.events.length > 0 && leg.events.every(e => e.pieces === "0" || e.pieces === 0));
console.log("hasZero:", hasZero);
