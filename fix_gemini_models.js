#!/usr/bin/env node
/**
 * Fix invalid Gemini model names in n8n workflow database.
 * Replaces non-existent models with gemini-1.5-flash which is stable and free-tier friendly.
 */

const fs = require('fs');

const dbPath = '/home/node/.n8n/database.sqlite';

// Read the database as a buffer
const buf = fs.readFileSync(dbPath);

let content = buf.toString('binary');
const originalLen = content.length;

// Models to replace -> target model
const replacements = [
  // Invalid models -> gemini-1.5-flash
  ['models/gemini-3.5-flash-lite', 'models/gemini-1.5-flash'],
  ['models/gemini-3.5-flash', 'models/gemini-1.5-flash'],
  ['models/gemini-3.6-flash', 'models/gemini-1.5-flash'],
  ['models/gemini-3.1-flash-lite', 'models/gemini-1.5-flash'],
  // Without prefix
  ['"gemini-3.5-flash-lite"', '"gemini-1.5-flash"'],
  ['"gemini-3.5-flash"', '"gemini-1.5-flash"'],
  ['"gemini-3.6-flash"', '"gemini-1.5-flash"'],
  ['"gemini-3.1-flash-lite"', '"gemini-1.5-flash"'],
];

let totalReplaced = 0;

for (const [from, to] of replacements) {
  let count = 0;
  let idx = 0;
  while ((idx = content.indexOf(from, idx)) !== -1) {
    // Replace only if padding lengths match to not corrupt the binary
    // We need to pad/shrink the replacement to match original length
    const diff = from.length - to.length;
    if (diff === 0) {
      content = content.substring(0, idx) + to + content.substring(idx + from.length);
    } else {
      // Pad with spaces if shorter, truncate if longer (shouldn't happen here)
      const padded = to.padEnd(from.length, ' ');
      content = content.substring(0, idx) + padded + content.substring(idx + from.length);
    }
    idx += to.length;
    count++;
    totalReplaced++;
  }
  if (count > 0) {
    console.log(`Replaced "${from}" -> "${to}" (${count} times)`);
  }
}

if (totalReplaced > 0) {
  // Verify length didn't change (binary safety)
  if (content.length !== originalLen) {
    console.error(`ERROR: Content length changed! Original: ${originalLen}, New: ${content.length}`);
    process.exit(1);
  }
  
  // Write back
  fs.writeFileSync(dbPath, Buffer.from(content, 'binary'));
  console.log(`\nSuccess! Total replacements: ${totalReplaced}`);
  console.log('Database updated. Restart n8n for changes to take effect.');
} else {
  console.log('No replacements needed - models may already be correct.');
}
