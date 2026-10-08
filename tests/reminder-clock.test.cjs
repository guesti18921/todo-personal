const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('native clock preserves wall time across zones and DST, without reviving old/cancelled/delivered alarms', () => {
 const out = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-clock-'));
 try {
  execFileSync('java', ['com.sun.tools.javac.Main', '-d', out, 'native/android/ReminderClock.java', 'native/tests/ReminderClockTest.java']);
  assert.match(execFileSync('java', ['-cp', out, 'com.m1strell.todopersonal.ReminderClockTest'], { encoding: 'utf8' }), /checks passed/);
 } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
