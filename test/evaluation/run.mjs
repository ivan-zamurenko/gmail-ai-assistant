#!/usr/bin/env node
/** Offline runner: evaluates the fixed reference outputs. No provider, no network, no cost. */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { evaluateSuite } from './evaluator.mjs';

if (process.argv.length > 2) {
  console.error('Live/provider evaluation is out of scope here; this runner only accepts fixed fixtures.');
  process.exit(2);
}
const corpus = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const outputs = Object.fromEntries(corpus.cases.map(spec => [spec.id, spec.referenceOutput]));
const report = evaluateSuite(corpus, outputs);
console.log(`${report.corpusVersion} | ${report.evaluatorVersion} | model: ${report.modelConfig.mode}`);
for (const item of report.cases) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'} ${item.id} route=${item.route}/${item.expectedRoute}`
    + `${item.critical.length ? ` critical=${item.critical.join(',')}` : ''}${item.misses.length ? ` misses=${item.misses.join(',')}` : ''}`);
}
console.log(`critical=${report.critical} passRate=${report.passRate.toFixed(2)} thresholds(${report.thresholds.status})`
  + ` maxCritical=${report.thresholds.maxCritical} minPassRate=${report.thresholds.minPassRate} → ${report.passed ? 'PASS' : 'FAIL'}`);
console.log(report.distributionNote);
process.exit(report.passed ? 0 : 1);
