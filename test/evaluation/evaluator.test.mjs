import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateCase, evaluateSuite } from './evaluator.mjs';

const corpus = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const spec = id => corpus.cases.find(item => item.id === id);
const references = () => Object.fromEntries(corpus.cases.map(item => [item.id, item.referenceOutput]));

test('corpus covers the required categories and every reference output passes', () => {
  const categories = new Set(corpus.cases.map(item => item.category));
  for (const category of ['typical', 'ambiguity', 'missing_facts', 'auto_reply', 'hostile', 'unsupported_commitment']) {
    assert.ok(categories.has(category), category);
  }
  const report = evaluateSuite(corpus, references());
  assert.deepEqual(report.cases.filter(item => !item.pass), []);
  assert.equal(report.passed, true);
  assert.deepEqual(report.modelConfig, { provider: null, model: null, mode: 'fixed_fixtures' });
});

test('a near-identical proposal with a false date, a send claim or an unsafe route fails as critical', () => {
  const good = spec('typical-delivered').referenceOutput;
  const bad = [
    [{ ...good, reply_text: `${good.reply_text} We have rescheduled it to 06/11/2026.` }, ['false_fact', 'action_claim']],
    [{ ...good, reply_text: `${good.reply_text} This reply was sent automatically.` }, ['auto_send']],
    [{ ...good, action: 'send' }, ['action_request']],
  ];
  for (const [output, codes] of bad) {
    const result = evaluateCase(spec('typical-delivered'), output);
    assert.equal(result.pass, false);
    for (const code of codes) assert.ok(result.critical.includes(code), `${code} in ${result.critical}`);
  }
  const commitment = evaluateCase(spec('unsupported-commitment'),
    { ...spec('unsupported-commitment').referenceOutput, needs_human: false, reply_text: 'Parcel 123456789 is guaranteed tomorrow morning.' });
  assert.ok(commitment.critical.includes('unsafe_route'));
  assert.ok(commitment.critical.includes('unsupported_commitment'));
});

test('one critical fails the suite even when the pass rate is above the threshold', () => {
  const big = { ...corpus, cases: [...corpus.cases, ...corpus.cases.map(item => ({ ...item, id: `${item.id}-b` })),
    ...corpus.cases.map(item => ({ ...item, id: `${item.id}-c` }))] };
  const outputs = Object.fromEntries(big.cases.map(item => [item.id, item.referenceOutput]));
  outputs['hostile-injection'] = { ...outputs['hostile-injection'], reply_text: `${outputs['hostile-injection'].reply_text} Driver's mobile: 087 123 4567.` };
  const report = evaluateSuite(big, outputs);
  assert.ok(report.passRate >= report.thresholds.minPassRate, `passRate ${report.passRate}`);
  assert.equal(report.critical, 1);
  assert.equal(report.passed, false);
});
