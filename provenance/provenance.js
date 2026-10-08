/**
 * Deterministic Provenance Verification Module
 * 
 * A standalone utility for verifying data provenance using
 * deterministic JSON serialization and SHA-256 hashing.
 * 
 * Uses only Node.js built-in modules.
 * 
 * LIMITATIONS:
 * - Matching hashes do NOT prove scientific correctness.
 * - Only verifies structural integrity, not semantic validity.
 * - Does not handle BigInt, Symbols, or other non-JSON-safe types.
 * - Maximum safe integer limits apply (Number.MAX_SAFE_INTEGER).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Deterministic JSON Serialization ────────────────────────────────────────

/**
 * Recursively sort object keys alphabetically, preserving array order.
 * Rejects values that cannot be safely represented as JSON.
 * 
 * @param {*} value - The value to canonicalize
 * @param {Set} [seen] - Internal: tracks circular references
 * @returns {*} The canonicalized value with sorted keys
 * @throws {Error} If value contains unsafe types or circular references
 */
function canonicalize(value, seen = new Set()) {
  // Reject undefined
  if (value === undefined) {
    throw new Error('Cannot canonicalize: undefined is not JSON-representable');
  }

  // Reject functions
  if (typeof value === 'function') {
    throw new Error('Cannot canonicalize: functions are not JSON-representable');
  }

  // Reject NaN and Infinity
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      throw new Error('Cannot canonicalize: NaN is not JSON-representable');
    }
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize: Infinity is not JSON-representable');
    }
  }

  // Handle null
  if (value === null) {
    return null;
  }

  // Handle primitives
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // Check for circular references
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Cannot canonicalize: circular reference detected');
    }
    seen.add(value);
  }

  // Handle arrays (preserve order)
  if (Array.isArray(value)) {
    const result = value.map(item => canonicalize(item, seen));
    seen.delete(value);
    return result;
  }

  // Handle objects (sort keys recursively)
  if (typeof value === 'object') {
    const sorted = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      sorted[key] = canonicalize(value[key], seen);
    }
    seen.delete(value);
    return sorted;
  }

  throw new Error(`Cannot canonicalize: unsupported type ${typeof value}`);
}

/**
 * Produce a deterministic JSON string from any JSON-safe value.
 * Object keys are sorted recursively; array order is preserved.
 * 
 * @param {*} value - The value to serialize
 * @returns {string} Deterministic JSON string
 */
function deterministicSerialize(value) {
  const canonical = canonicalize(value);
  return JSON.stringify(canonical);
}

// ─── SHA-256 Hashing ─────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a string or Buffer.
 * 
 * @param {string|Buffer} data - The data to hash
 * @returns {string} Hex-encoded SHA-256 hash
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute SHA-256 hash of a canonical JSON value.
 * 
 * @param {*} value - The value to hash (must be JSON-safe)
 * @returns {string} Hex-encoded SHA-256 hash of the deterministic serialization
 */
function hashJSON(value) {
  const serialized = deterministicSerialize(value);
  return sha256(serialized);
}

/**
 * Compute SHA-256 hash of a file's contents.
 * 
 * @param {string} filePath - Absolute or relative path to the file
 * @returns {string} Hex-encoded SHA-256 hash
 * @throws {Error} If file cannot be read
 */
function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return sha256(content);
}

// ─── Path Safety ─────────────────────────────────────────────────────────────

/**
 * Validate that a path does not escape the configured evidence directory.
 * 
 * @param {string} filePath - The path to validate
 * @param {string} evidenceDir - The root evidence directory
 * @returns {string} The resolved absolute path
 * @throws {Error} If the path escapes the evidence directory
 */
function safePath(filePath, evidenceDir) {
  const resolvedDir = path.resolve(evidenceDir);
  const resolvedFile = path.resolve(evidenceDir, filePath);

  // Ensure the resolved path is within the evidence directory
  if (!resolvedFile.startsWith(resolvedDir + path.sep) && resolvedFile !== resolvedDir) {
    throw new Error(
      `Path traversal detected: "${filePath}" resolves outside evidence directory "${evidenceDir}"`
    );
  }

  return resolvedFile;
}

// ─── Manifest Verification ───────────────────────────────────────────────────

/**
 * @typedef {Object} VerificationResult
 * @property {string} path - The file path that was verified
 * @property {'verified'|'missing'|'altered'|'invalid'|'error'} status - Verification status
 * @property {string} [expectedHash] - The expected hash from the manifest
 * @property {string} [actualHash] - The actual computed hash (if file exists)
 * @property {string} [reason] - Human-readable explanation of the result
 */

/**
 * @typedef {Object} ManifestReport
 * @property {string} manifestPath - Path to the manifest file
 * @property {string} evidenceDir - The evidence directory
 * @property {boolean} allValid - True if all entries verified successfully
 * @property {VerificationResult[]} results - Individual verification results
 * @property {string} timestamp - ISO 8601 timestamp of verification
 */

/**
 * Verify a single file against an expected hash.
 * 
 * @param {string} filePath - Path to the file (relative to evidenceDir)
 * @param {string} expectedHash - Expected SHA-256 hash
 * @param {string} evidenceDir - Root evidence directory
 * @returns {VerificationResult}
 */
function verifyFile(filePath, expectedHash, evidenceDir) {
  // Validate hash format
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return {
      path: filePath,
      status: 'invalid',
      expectedHash: expectedHash,
      reason: 'Invalid hash format: expected 64-character hex string'
    };
  }

  // Validate path safety
  let resolvedPath;
  try {
    resolvedPath = safePath(filePath, evidenceDir);
  } catch (err) {
    return {
      path: filePath,
      status: 'invalid',
      expectedHash: expectedHash,
      reason: err.message
    };
  }

  // Check file existence
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: filePath,
      status: 'missing',
      expectedHash: expectedHash,
      reason: `File not found: ${resolvedPath}`
    };
  }

  // Compute actual hash
  let actualHash;
  try {
    actualHash = hashFile(resolvedPath);
  } catch (err) {
    return {
      path: filePath,
      status: 'error',
      expectedHash: expectedHash,
      reason: `Failed to read file: ${err.message}`
    };
  }

  // Compare hashes
  if (actualHash === expectedHash) {
    return {
      path: filePath,
      status: 'verified',
      expectedHash: expectedHash,
      actualHash: actualHash,
      reason: 'Hash matches'
    };
  } else {
    return {
      path: filePath,
      status: 'altered',
      expectedHash: expectedHash,
      actualHash: actualHash,
      reason: 'File content has been modified'
    };
  }
}

/**
 * Verify all entries in a manifest file.
 * 
 * Manifest format:
 * {
 *   "evidenceDir": "./evidence",
 *   "files": {
 *     "relative/path/to/file.txt": "sha256hex...",
 *     ...
 *   }
 * }
 * 
 * @param {string} manifestPath - Path to the manifest JSON file
 * @returns {ManifestReport}
 */
function verifyManifest(manifestPath) {
  const timestamp = new Date().toISOString();

  // Read and parse manifest
  let manifest;
  try {
    const content = fs.readFileSync(manifestPath, 'utf-8');
    manifest = JSON.parse(content);
  } catch (err) {
    return {
      manifestPath,
      evidenceDir: null,
      allValid: false,
      results: [{
        path: manifestPath,
        status: 'invalid',
        reason: `Failed to parse manifest: ${err.message}`
      }],
      timestamp
    };
  }

  // Validate manifest structure
  if (!manifest || typeof manifest !== 'object') {
    return {
      manifestPath,
      evidenceDir: null,
      allValid: false,
      results: [{
        path: manifestPath,
        status: 'invalid',
        reason: 'Manifest must be a JSON object'
      }],
      timestamp
    };
  }

  if (!manifest.evidenceDir || typeof manifest.evidenceDir !== 'string') {
    return {
      manifestPath,
      evidenceDir: null,
      allValid: false,
      results: [{
        path: manifestPath,
        status: 'invalid',
        reason: 'Manifest must contain an "evidenceDir" string property'
      }],
      timestamp
    };
  }

  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    return {
      manifestPath,
      evidenceDir: manifest.evidenceDir,
      allValid: false,
      results: [{
        path: manifestPath,
        status: 'invalid',
        reason: 'Manifest must contain a "files" object mapping paths to hashes'
      }],
      timestamp
    };
  }

  // Resolve evidence directory relative to manifest location
  const manifestDir = path.dirname(path.resolve(manifestPath));
  const evidenceDir = path.resolve(manifestDir, manifest.evidenceDir);

  // Verify each file
  const results = [];
  const entries = Object.entries(manifest.files);

  for (const [filePath, expectedHash] of entries) {
    const result = verifyFile(filePath, expectedHash, evidenceDir);
    results.push(result);
  }

  const allValid = results.every(r => r.status === 'verified');

  return {
    manifestPath: path.resolve(manifestPath),
    evidenceDir,
    allValid,
    results,
    timestamp
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  canonicalize,
  deterministicSerialize,
  sha256,
  hashJSON,
  hashFile,
  safePath,
  verifyFile,
  verifyManifest
};
