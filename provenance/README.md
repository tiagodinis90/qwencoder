# Deterministic Provenance Verification Prototype

A standalone Node.js utility for verifying data provenance using deterministic JSON serialization and SHA-256 hashing.

**IMPORTANT**: This is a structural integrity verification tool. Matching hashes do NOT prove scientific correctness. They only confirm that data has not been altered since the manifest was created.

## Overview

This module provides:

1. **Deterministic JSON serialization** — recursively sorted object keys, preserved array order
2. **Unsafe value rejection** — NaN, Infinity, undefined, functions, circular references
3. **SHA-256 hashing** — for files and canonical JSON data
4. **Manifest verification** — file paths + expected hashes → structured results
5. **Path safety** — rejects traversal attempts escaping the evidence directory
6. **Structured results** — verified, missing, altered, invalid, error statuses

## Files

```
provenance/
├── provenance.js          # Main module (all functionality)
├── provenance.test.js     # Automated tests (Node.js built-in test runner)
├── generate-manifest.js   # Helper to generate example manifest with correct hashes
├── example/
│   ├── manifest.json      # Synthetic example manifest
│   └── evidence/
│       ├── synthetic-station-readings.csv   # Synthetic test data
│       └── synthetic-station-metadata.json  # Synthetic test data
└── README.md              # This file
```

## Constraints

- ✅ Uses only Node.js built-in modules (`crypto`, `fs`, `path`, `os`)
- ✅ Zero npm dependencies
- ✅ No frameworks or frontend
- ✅ No external network access
- ✅ All test fixtures are synthetic and clearly labelled
- ✅ Does not implement scientific calculations or environmental models

## Execution Commands

### Prerequisites

- Node.js >= 18.0 (for built-in test runner support)

### Run Tests

```bash
cd provenance
node --test provenance.test.js
```

### Generate Example Manifest

```bash
cd provenance
node generate-manifest.js
```

This computes SHA-256 hashes of the synthetic evidence files and writes `example/manifest.json`.

### Verify the Example Manifest

```bash
cd provenance
node -e "
const { verifyManifest } = require('./provenance.js');
const report = verifyManifest('./example/manifest.json');
console.log(JSON.stringify(report, null, 2));
"
```

### Use as a Module

```javascript
const {
  hashJSON,
  hashFile,
  verifyManifest,
  deterministicSerialize
} = require('./provenance.js');

// Hash a JSON value deterministically
const hash = hashJSON({ b: 2, a: 1 });
// Same as: hashJSON({ a: 1, b: 2 }) — key order doesn't matter

// Hash a file
const fileHash = hashFile('/path/to/file.txt');

// Verify a manifest
const report = verifyManifest('/path/to/manifest.json');
console.log(report.allValid); // true/false
console.log(report.results);  // [{ path, status, reason, ... }]
```

## API Reference

### `canonicalize(value)`
Recursively sort object keys, preserve array order, reject unsafe values.

### `deterministicSerialize(value)`
Return a deterministic JSON string with sorted keys.

### `sha256(data)`
Compute SHA-256 hash of a string or Buffer. Returns hex string.

### `hashJSON(value)`
Compute SHA-256 of the deterministic serialization of a JSON-safe value.

### `hashFile(filePath)`
Compute SHA-256 of a file's raw contents.

### `safePath(filePath, evidenceDir)`
Resolve a path and verify it stays within the evidence directory. Throws on traversal.

### `verifyFile(filePath, expectedHash, evidenceDir)`
Verify a single file. Returns `{ path, status, expectedHash, actualHash?, reason }`.

### `verifyManifest(manifestPath)`
Verify all entries in a manifest file. Returns a `ManifestReport` object.

## Manifest Format

```json
{
  "evidenceDir": "./evidence",
  "files": {
    "relative/path/to/file.csv": "sha256_hex_64_chars",
    "another/file.json": "sha256_hex_64_chars"
  }
}
```

- `evidenceDir` — resolved relative to the manifest file's location
- `files` — mapping of relative paths to expected SHA-256 hashes

## Verification Result Statuses

| Status     | Meaning                                    |
|------------|--------------------------------------------|
| `verified` | File exists and hash matches               |
| `missing`  | File does not exist                        |
| `altered`  | File exists but hash does not match        |
| `invalid`  | Bad hash format, path traversal, or bad manifest |
| `error`    | File could not be read (permissions, etc.) |

## Test Coverage

The test suite covers:

- ✅ Same JSON data with different key order → same hash
- ✅ Changed numerical input → different hash
- ✅ Array reordering → different hash
- ✅ Deeply nested objects with different key order → same hash
- ✅ Rejection of NaN, Infinity, undefined, functions, circular references
- ✅ Missing file → verification fails with status `missing`
- ✅ Modified file → verification fails with status `altered`
- ✅ Invalid manifest (malformed JSON) → fails safely with status `invalid`
- ✅ Path traversal attempt → rejected with status `invalid`
- ✅ Valid input → reproducible verification report
- ✅ 100 invocations of hashJSON → identical results

## Known Limitations

1. **Not a security tool**: SHA-256 collision resistance is assumed but not formally verified in this context. This is a provenance aid, not a cryptographic guarantee.

2. **No streaming for large files**: `hashFile` reads entire files into memory. Very large files (>1GB) may cause memory issues.

3. **No incremental verification**: The entire manifest is verified each time. No caching or delta detection.

4. **JSON-only data model**: Only JSON-safe values are supported. BigInt, Symbol, Date objects (serialized as strings), Map, Set, etc. are not handled.

5. **No versioning**: The manifest format has no version field. Future changes to serialization rules would invalidate old manifests without warning.

6. **Timestamps in reports**: `verifyManifest` includes wall-clock timestamps, which differ across runs. This is intentional for audit trails but means reports are not byte-identical across runs.

7. **No manifest signing**: The manifest itself is not signed. An attacker who can modify files can also modify the manifest.

8. **Locale/path separator sensitivity**: Path comparisons use `path.sep` which varies by OS. Manifests created on Windows may not verify on Linux and vice versa.

9. **No compression or binary format support**: Only raw file bytes are hashed. Compressed files are hashed as-is (compressed bytes), not decompressed content.

10. **Scientific correctness NOT verified**: A matching hash only proves the bytes haven't changed. It says nothing about whether the data is scientifically valid, correctly measured, or appropriately processed.

## Synthetic Data Notice

All test fixtures and example files are **synthetic**. They use fabricated station IDs, timestamps, and measurements. No real environmental data is included. These fixtures exist solely to demonstrate and test the verification mechanism.

## License

This module is provided as-is for integration into the Evidence-to-Action decision-support system. No warranty is expressed or implied.
