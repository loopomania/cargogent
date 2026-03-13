# Excel Files Comparison — awbs Folder

## File Inventory

| File | Size | MD5 | Notes |
|------|------|-----|-------|
| `IL1 DSV Shipment Report (Transport Data) Sunday, 08 February 2026 09_41_32.xlsx` | 2.0 MB | 82c8f47693f3c405a8cb11ba45946451 | |
| `IL1 DSV Shipment Report (Transport Data) Sunday, 08 February 2026 09_41_32_1.xlsx` | 2.0 MB | 82c8f47693f3c405a8cb11ba45946451 | **Identical** to 09_41_32 |
| `IL1 DSV Shipment Report (Transport Data) Sunday, 08 February 2026 09_41_43.xlsx` | 5.0 MB | f9eb4963ec8ad5a5a9c7066a274df621 | |
| `IL1 DSV Shipment Report (Transport Data) Sunday, 08 February 2026 09_41_43_1.xlsx` | 5.0 MB | f9eb4963ec8ad5a5a9c7066a274df621 | **Identical** to 09_41_43 |

## Differences

### 1. Duplicate Files

- `*_1.xlsx` files are **byte-for-byte identical** to their non-`_1` counterparts. No content difference.

### 2. Two Distinct Versions (09_41_32 vs 09_41_43)

| Aspect | 09_41_32 | 09_41_43 |
|--------|----------|----------|
| **Created** | 2026-02-08 07:45:13 UTC | 2026-02-08 07:51:14 UTC |
| **File size** | 2.0 MB | 5.0 MB |
| **Sheet structure** | Same (DSV Shipment Report, Filter, Sort) | Same |
| **Column range** | A1:LT (same) | A1:LT (same) |
| **Row range** | A1:LT**1773** | A1:LT**4630** |
| **Shared strings** | 297 | 1022 |

### 3. Summary of Differences

| Difference | Details |
|------------|---------|
| **Row count** | 09_41_43 has **2,857 more rows** (4,630 vs 1,773) |
| **Timestamp** | 09_41_43 was generated **~6 minutes later** |
| **Content** | 09_41_43 contains more shipment records (more data, more unique strings) |

### 4. Structure (Same Across All)

- **Sheets**: DSV Shipment Report (main), Filter (hidden), Sort (hidden)
- **Columns**: Same layout (A through LT)
- **Format**: Same template; only data volume and creation time differ

## Conclusion

- **No structural differences** — same columns and sheet layout.
- **Two unique datasets**: 09_41_32 (smaller, earlier) and 09_41_43 (larger, later).
- **Duplicate files** (`_1` suffix) can be ignored for processing.
