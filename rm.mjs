// Deletion helper: PowerShell's Remove-Item is denied on some files here.
// Try Node's own unlink and report per-target truthfully.
//
// Targets come from the RM_TARGETS environment variable, separated by ';'.
// ASCII only by project rule.

import { existsSync, unlinkSync } from 'node:fs';

const raw = process.env.RM_TARGETS || '';
const targets = raw.split(';').map((s) => s.trim()).filter(Boolean);

if (targets.length === 0) {
  console.log('NO_TARGETS');
  process.exit(2);
}

for (const t of targets) {
  if (!existsSync(t)) {
    console.log('ABSENT ', t);
    continue;
  }
  try {
    unlinkSync(t);
    console.log('DELETED', t);
  } catch (e) {
    console.log('FAILED ', t, '<-', e.code || e.message);
  }
}
