#!/usr/bin/env node
import { runWatchdog } from "./watchdog.js";

runWatchdog().then((report) => {
  console.log(`StudioOps watchdog (${report.generatedAt})`);
  console.log(`Reconciled: ${report.reconciliation.actions.length}  Worker actions: ${report.actions.length}`);
  for (const action of report.actions) {
    const target = action.worker || action.type;
    console.log(`${action.ok ? "[ok]" : "[failed]"} ${target}: ${action.reason}`);
    if (action.output) console.log(`  ${action.output}`);
  }
}).catch((error) => {
  console.error(`StudioOps watchdog failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
