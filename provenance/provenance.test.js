/**
 * Tests for the Deterministic Provenance Verification Module
 * 
 * Uses Node.js built-in test runner (node:test) and assert module.
 * 
 * Run with: node --test provenance.test.js
 */

'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  canonicalize,
  deterministicSerialize,
  sha256,
  hashJSON,
  hashFile,
  safePath,
  verifyFile,
  verifyManifest
} = require('./provenance.js');

// ─── Test Fixtures ───────────────────────────────────────────────────────────
// All test data is SYNTHETIC and clearly labelled as such.
// No real environmental data is used.

const SYNTHETIC_FIXTURE_DIR = path.join(os.tmpdir(), 'provenance-test-fixtures');

// ─── Deterministic Serialization Tests ───────────────────────────────────────

describe('Deterministic JSON Serialization', () => {

  it('produces the same hash for objects with different key order', () => {
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2 = { a: 2, m: 3, z: 1 };

    const hash1 = hashJSON(obj1);
    const hash2 = hashJSON(obj2);

    assert.equal(hash1, hash2, 'Same data with different key order must produce same hash');
    assert.match(hash1, /^[a-f0-9]{64}$/, 'Hash must be 64-char hex');
  });

  it('produces different hashes for different numerical values', () => {
    const obj1 = { temperature: 22.5, humidity: 65 };
    const obj2 = { temperature: 23.0, humidity: 65 };

    const hash1 = hashJSON(obj1);
    const hash2 = hashJSON(obj2);

    assert.notEqual(hash1, hash2, 'Changed numerical input must produce different hash');
  });

  it('produces different hashes when array order changes', () => {
    const obj1 = { readings: [1, 2, 3] };
    const obj2 = { readings: [3, 2, 1] };

    const hash1 = hashJSON(obj1);
    const hash2 = hashJSON(obj2);

    assert.notEqual(hash1, hash2, 'Array reordering must change the hash');
  });

  it('produces the same hash for deeply nested objects with different key order', () => {
    const obj1 = {
      station: { location: { lat: 51.5, lon: -0.1 }, name: 'Synthetic-A' },
      readings: [{ value: 10 }, { value: 20 }]
    };
    const obj2 = {
      readings: [{ value: 10 }, { value: 20 }],
      station: { name: 'Synthetic-A', location: { lon: -0.1, lat: 51.5 } }
    };

    const hash1 = hashJSON(obj1);
    const hash2 = hashJSON(obj2);

    assert.equal(hash1, hash2, 'Deeply nested objects with different key order must match');
  });

  it('preserves array order while sorting object keys within arrays', () => {
    const obj1 = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    const obj2 = { items: [{ a: 1, b: 2 }, { c: 3, d: 4 }] };

    const hash1 = hashJSON(obj1);
    const hash2 = hashJSON(obj2);

    assert.equal(hash1, hash2, 'Keys within array elements must be sorted');
  });
});

// ─── Unsafe Value Rejection Tests ────────────────────────────────────────────

describe('Unsafe Value Rejection', () => {

  it('rejects NaN', () => {
    assert.throws(
      () => canonicalize(NaN),
      { message: /NaN/ },
      'Must reject NaN'
    );
  });

  it('rejects Infinity', () => {
    assert.throws(
      () => canonicalize(Infinity),
      { message: /Infinity/ },
      'Must reject Infinity'
    );
  });

  it('rejects negative Infinity', () => {
    assert.throws(
      () => canonicalize(-Infinity),
      { message: /Infinity/ },
      'Must reject -Infinity'
    );
  });

  it('rejects undefined', () => {
    assert.throws(
      () => canonicalize(undefined),
      { message: /undefined/ },
      'Must reject undefined'
    );
  });

  it('rejects functions', () => {
    assert.throws(
      () => canonicalize(() => 42),
      { message: /function/ },
      'Must reject functions'
    );
  });

  it('rejects circular references', () => {
    const circular = { a: 1 };
    circular.self = circular;

    assert.throws(
      () => canonicalize(circular),
      { message: /circular/ },
      'Must reject circular references'
    );
  });

  it('rejects undefined values within objects', () => {
    assert.throws(
      () => canonicalize({ a: 1, b: undefined }),
      { message: /undefined/ },
      'Must reject objects containing undefined'
    );
  });
});

// ─── SHA-256 Hashing Tests ───────────────────────────────────────────────────

describe('SHA-256 Hashing', () => {

  it('produces correct hash for known input', () => {
    // SHA-256 of empty string is well-known
    const hash = sha256('');
    assert.equal(
      hash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'SHA-256 of empty string must match known value'
    );
  });

  it('produces 64-character hex string', () => {
    const hash = sha256('synthetic test data');
    assert.match(hash, /^[a-f0-9]{64}$/, 'Hash must be 64 lowercase hex characters');
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = sha256('input-a');
    const hash2 = sha256('input-b');
    assert.notEqual(hash1, hash2);
  });
});

// ─── File Hashing Tests ──────────────────────────────────────────────────────

describe('File Hashing', () => {

  before(() => {
    fs.mkdirSync(SYNTHETIC_FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(SYNTHETIC_FIXTURE_DIR, 'synthetic-data.txt'),
      'SYNTHETIC TEST DATA - NOT REAL ENVIRONMENTAL MEASUREMENTS\n'
    );
  });

  after(() => {
    fs.rmSync(SYNTHETIC_FIXTURE_DIR, { recursive: true, force: true });
  });

  it('produces consistent hash for same file content', () => {
    const hash1 = hashFile(path.join(SYNTHETIC_FIXTURE_DIR, 'synthetic-data.txt'));
    const hash2 = hashFile(path.join(SYNTHETIC_FIXTURE_DIR, 'synthetic-data.txt'));
    assert.equal(hash1, hash2, 'Same file must produce same hash');
  });

  it('throws for non-existent file', () => {
    assert.throws(
      () => hashFile(path.join(SYNTHETIC_FIXTURE_DIR, 'nonexistent.txt')),
      'Must throw for missing file'
    );
  });
});

// ─── Path Safety Tests ───────────────────────────────────────────────────────

describe('Path Safety', () => {

  const evidenceDir = '/safe/evidence';

  it('accepts valid relative paths', () => {
    const result = safePath('data/file.txt', evidenceDir);
    assert.equal(result, path.resolve('/safe/evidence/data/file.txt'));
  });

  it('rejects path traversal with ..', () => {
    assert.throws(
      () => safePath('../../etc/passwd', evidenceDir),
      { message: /traversal/i },
      'Must reject path traversal attempts'
    );
  });

  it('rejects absolute paths outside evidence dir', () => {
    assert.throws(
      () => safePath('/etc/passwd', evidenceDir),
      { message: /traversal/i },
      'Must reject absolute paths outside evidence directory'
    );
  });

  it('rejects encoded traversal attempts', () => {
    assert.throws(
      () => safePath('data/../../../etc/shadow', evidenceDir),
      { message: /traversal/i },
      'Must reject encoded traversal'
    );
  });
});

// ─── Manifest Verification Tests ─────────────────────────────────────────────

describe('Manifest Verification', () => {

  const testDir = path.join(os.tmpdir(), 'provenance-manifest-test');
  const evidenceDir = path.join(testDir, 'evidence');
  const manifestPath = path.join(testDir, 'manifest.json');

  before(() => {
    fs.mkdirSync(evidenceDir, { recursive: true });

    // Create synthetic test files
    fs.writeFileSync(
      path.join(evidenceDir, 'synthetic-reading-001.csv'),
      'timestamp,value,unit\n2024-01-01T00:00:00Z,22.5,celsius\n'
    );
    fs.writeFileSync(
      path.join(evidenceDir, 'synthetic-reading-002.csv'),
      'timestamp,value,unit\n2024-01-01T01:00:00Z,23.1,celsius\n'
    );
  });

  after(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('verifies a valid manifest successfully', () => {
    // Compute actual hashes for the synthetic files
    const hash1 = hashFile(path.join(evidenceDir, 'synthetic-reading-001.csv'));
    const hash2 = hashFile(path.join(evidenceDir, 'synthetic-reading-002.csv'));

    const manifest = {
      evidenceDir: './evidence',
      files: {
        'synthetic-reading-001.csv': hash1,
        'synthetic-reading-002.csv': hash2
      }
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const report = verifyManifest(manifestPath);

    assert.equal(report.allValid, true, 'All files should verify');
    assert.equal(report.results.length, 2);
    assert.equal(report.results[0].status, 'verified');
    assert.equal(report.results[1].status, 'verified');
    assert.ok(report.timestamp, 'Report must include timestamp');
  });

  it('detects missing files', () => {
    const manifest = {
      evidenceDir: './evidence',
      files: {
        'nonexistent-file.csv': 'a'.repeat(64)
      }
    };

    const missingManifestPath = path.join(testDir, 'missing-manifest.json');
    fs.writeFileSync(missingManifestPath, JSON.stringify(manifest, null, 2));

    const report = verifyManifest(missingManifestPath);

    assert.equal(report.allValid, false);
    assert.equal(report.results[0].status, 'missing');
    assert.match(report.results[0].reason, /not found/i);
  });

  it('detects modified files', () => {
    // Create a file and compute its hash
    const modifiedFilePath = path.join(evidenceDir, 'will-be-modified.txt');
    fs.writeFileSync(modifiedFilePath, 'original content');
    const originalHash = hashFile(modifiedFilePath);

    // Create manifest with original hash
    const manifest = {
      evidenceDir: './evidence',
      files: {
        'will-be-modified.txt': originalHash
      }
    };

    const modManifestPath = path.join(testDir, 'modified-manifest.json');
    fs.writeFileSync(modManifestPath, JSON.stringify(manifest, null, 2));

    // Modify the file AFTER manifest creation
    fs.writeFileSync(modifiedFilePath, 'MODIFIED content - this simulates tampering');

    const report = verifyManifest(modManifestPath);

    assert.equal(report.allValid, false);
    assert.equal(report.results[0].status, 'altered');
    assert.match(report.results[0].reason, /modified/i);
    assert.notEqual(report.results[0].expectedHash, report.results[0].actualHash);
  });

  it('rejects invalid manifest (malformed JSON)', () => {
    const badManifestPath = path.join(testDir, 'bad-manifest.json');
    fs.writeFileSync(badManifestPath, '{ this is not valid json }}}');

    const report = verifyManifest(badManifestPath);

    assert.equal(report.allValid, false);
    assert.equal(report.results[0].status, 'invalid');
    assert.match(report.results[0].reason, /parse/i);
  });

  it('rejects manifest with missing evidenceDir', () => {
    const badManifestPath = path.join(testDir, 'no-evidir-manifest.json');
    fs.writeFileSync(badManifestPath, JSON.stringify({ files: {} }));

    const report = verifyManifest(badManifestPath);

    assert.equal(report.allValid, false);
    assert.equal(report.results[0].status, 'invalid');
    assert.match(report.results[0].reason, /evidenceDir/i);
  });

  it('rejects manifest with invalid hash format', () => {
    const manifest = {
      evidenceDir: './evidence',
      files: {
        'synthetic-reading-001.csv': 'not-a-valid-hash'
      }
    };

    const badHashManifestPath = path.join(testDir, 'bad-hash-manifest.json');
    fs.writeFileSync(badHashManifestPath, JSON.stringify(manifest, null, 2));

    const report = verifyManifest(badHashManifestPath);

    assert.equal(report.allValid, false);
    assert.equal(report.results[0].status, 'invalid');
    assert.match(report.results[0].reason, /invalid hash/i);
  });

  it('rejects path traversal in manifest entries', () => {
    const manifest = {
      evidenceDir: './evidence',
      files: {
        '../../etc/passwd': 'a'.repeat(64)
      }
    };

    const traversalManifestPath = path.join(testDir, 'traversal-manifest.json');
    fs.writeFileSync(traversalManifestPath, JSON.stringify(manifest, null, 2));

    const report = verifyManifest(traversalManifestPath);

    assert.equal(report.allValid, false);
    assert.equal(report.results[0].status, 'invalid');
    assert.match(report.results[0].reason, /traversal/i);
  });

  it('produces a reproducible verification report for valid input', () => {
    const hash1 = hashFile(path.join(evidenceDir, 'synthetic-reading-001.csv'));

    const manifest = {
      evidenceDir: './evidence',
      files: {
        'synthetic-reading-001.csv': hash1
      }
    };

    const reproManifestPath = path.join(testDir, 'repro-manifest.json');
    fs.writeFileSync(reproManifestPath, JSON.stringify(manifest, null, 2));

    // Run verification twice
    const report1 = verifyManifest(reproManifestPath);
    const report2 = verifyManifest(reproManifestPath);

    // Results (excluding timestamp) must be identical
    assert.equal(report1.allValid, report2.allValid);
    assert.equal(report1.results.length, report2.results.length);
    assert.equal(report1.results[0].status, report2.results[0].status);
    assert.equal(report1.results[0].actualHash, report2.results[0].actualHash);
    assert.equal(report1.evidenceDir, report2.evidenceDir);
  });
});

// ─── Reproducibility Test ────────────────────────────────────────────────────

describe('Reproducibility', () => {

  it('produces identical hashes across multiple invocations', () => {
    const data = {
      synthetic_station: 'ALPHA',
      measurements: [
        { time: '2024-01-01', value: 15.2 },
        { time: '2024-01-02', value: 16.8 }
      ],
      metadata: { source: 'synthetic', version: 1 }
    };

    const hashes = [];
    for (let i = 0; i < 100; i++) {
      hashes.push(hashJSON(data));
    }

    const unique = new Set(hashes);
    assert.equal(unique.size, 1, '100 invocations must produce identical hash');
  });
});
