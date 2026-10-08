#!/usr/bin/env node
/**
 * Generate a provenance manifest for the example evidence files.
 * 
 * Usage: node generate-manifest.js
 * 
 * This computes SHA-256 hashes of the synthetic evidence files
 * and writes a manifest.json file.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { hashFile } = require('./provenance.js');

const evidenceDir = path.join(__dirname, 'example', 'evidence');
const manifestPath = path.join(__dirname, 'example', 'manifest.json');

// List evidence files
const files = fs.readdirSync(evidenceDir).filter(f => {
  const stat = fs.statSync(path.join(evidenceDir, f));
  return stat.isFile();
});

// Compute hashes
const fileHashes = {};
for (const file of files) {
  const filePath = path.join(evidenceDir, file);
  fileHashes[file] = hashFile(filePath);
  console.log(`  ${file}: ${fileHashes[file]}`);
}

// Write manifest
const manifest = {
  evidenceDir: './evidence',
  generated: new Date().toISOString(),
  note: 'SYNTHETIC DATA - Test fixture only. Not real environmental evidence.',
  files: fileHashes
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nManifest written to: ${manifestPath}`);
