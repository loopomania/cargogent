function cleanCity(loc) {
  if (!loc || loc === "???") return null;
  // If there is an IATA code in parentheses (e.g. "Athens (ATH)"), extract it
  const match = loc.match(/\(([A-Za-z]{3})\)/);
  if (match) return match[1].toUpperCase();

  let clean = loc.replace(/\s*\([^)]*\)/g, "").trim().toUpperCase();
  if (clean.length === 5 && !clean.includes(" ")) {
    clean = clean.substring(2);
  }
  return clean;
}

console.log(cleanCity("Athens (ATH)"));
console.log(cleanCity("TLV (MAMAN)"));
console.log(cleanCity("NEW YORK JFK"));
