/**
 * Run: cd backend && npx tsx src/tests/hawbLiveQuery.test.ts
 */
import assert from "node:assert/strict";
import { hawbQueryParamForLiveTrack, normalizeAirWaybillDigits } from "../services/hawbLiveQuery.js";

assert.equal(normalizeAirWaybillDigits("615-66487890"), "61566487890");
assert.equal(hawbQueryParamForLiveTrack("61566487890", "ISR10056724"), "ISR10056724");
assert.equal(hawbQueryParamForLiveTrack("615-66487890", "ISR10056724"), "ISR10056724");
assert.equal(hawbQueryParamForLiveTrack("61566487890", "61566487890"), undefined);
assert.equal(hawbQueryParamForLiveTrack("615-66487890", "61566487890"), undefined);
assert.equal(hawbQueryParamForLiveTrack("61566487890", null), undefined);
assert.equal(hawbQueryParamForLiveTrack("61566487890", "   "), undefined);

console.log("hawbLiveQuery.test.ts OK");
