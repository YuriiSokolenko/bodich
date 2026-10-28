import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LAB_THRESHOLDS, FIELD_THRESHOLDS, REQUIRED_LAB_RUNS, median } from './lib/release-qa-policy.mjs';

const matrixFile = new URL('../docs/qa/issue-69-matrix.json', import.meta.url);
const expectedPlatforms = ['android-chrome', 'iphone-safari', 'desktop-chromium', 'desktop-firefox', 'macos-safari'];
const expectedRows = expectedPlatforms.flatMap((platform) => ['en', 'ro'].map((locale) => platform + '-' + locale));
const expectedLab = ['en-home', 'en-products', 'ro-home', 'ro-products'];
const requiredChecks = ['keyboard', 'images', 'semanticControls', 'zoom', 'reducedMotion', 'languageSwitch', 'wcag22AA', 'axe'];
const limits = LAB_THRESHOLDS;
const isText = (value) => typeof value === 'string' && value.trim() !== '' && !/^(tbd|unknown|pending|n\/a)$/i.test(value.trim());
const isRef = (value) => isText(value) &&
  (/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:actions\/runs\/\d+|issues\/\d+|pull\/\d+)(?:[#/?].*)?$/.test(value) ||
   /^restricted:[A-Za-z0-9_.:/-]{8,}$/.test(value));
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const isMetric = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const samePerson = (a, b) => isText(a) && isText(b) && a.normalize('NFKC').trim().toLocaleLowerCase() === b.normalize('NFKC').trim().toLocaleLowerCase();
const fail = (errors, message) => errors.push(message);

function evaluate(record) {
  const errors = [];
  if (record.schemaVersion !== 1 || record.issue !== 69 || record.scope !== 'informational_only_release_safe') {
    fail(errors, 'schemaVersion, issue or release-safe scope mismatch');
  }
  if (!['NO_GO', 'GO'].includes(record.releaseGate)) fail(errors, 'Invalid releaseGate');
  if (!Array.isArray(record.rows) ||
      record.rows.length !== expectedRows.length ||
      new Set(record.rows.map((r) => r.id)).size !== expectedRows.length ||
      expectedRows.some((id) => !record.rows.some((r) => r.id === id))) {
    fail(errors, 'Complete unique platform/locale matrix (10 rows) required');
    return errors;
  }
  for (const row of record.rows) {
    const mobile = ['android-chrome', 'iphone-safari'].includes(row.platform);
    if (row.id !== row.platform + '-' + row.locale ||
        !expectedPlatforms.includes(row.platform) || !['en', 'ro'].includes(row.locale)) {
      fail(errors, row.id + ': platform/locale identity mismatch');
    }
    if (row.status !== 'PASS') { fail(errors, row.id + ': real-device report not PASS'); continue; }
    for (const key of ['tester', 'deviceModel', 'osVersion', 'browserVersion']) {
      if (!isText(row[key])) fail(errors, row.id + ': missing ' + key);
    }
    if (!isDate(row.testedAt) || row.testedAt > new Date().toISOString().slice(0, 10)) {
      fail(errors, row.id + ': missing or future test date');
    }
    if (!isRef(row.reportRef)) fail(errors, row.id + ': versioned evidence reference missing');
    const orientationKeys = mobile ? ['portrait', 'landscape'] : ['landscape'];
    for (const k of orientationKeys) if (row.orientations?.[k] !== 'PASS') fail(errors, row.id + ': ' + k + ' orientation not PASS');
    const keys = mobile ? [...requiredChecks, 'touch', 'screenReader'] : requiredChecks;
    for (const k of keys) if (row.checks?.[k] !== 'PASS') fail(errors, row.id + ': ' + k + ' not PASS');
    if (row.retest !== 'PASS' || !isRef(row.retestRef) || row.retestRef === row.reportRef ||
        !isText(row.retester) || samePerson(row.tester, row.retester) ||
        !isDate(row.retestedAt) || row.retestedAt > new Date().toISOString().slice(0, 10) ||
        row.retestedAt < row.testedAt || (isDate(record.reviewedAt) && row.retestedAt > record.reviewedAt)) {
      fail(errors, row.id + ': independent retest identity, chronology or distinct evidence missing');
    }
    if (!Array.isArray(row.defects)) {
      fail(errors, row.id + ': defects list missing');
    } else {
      for (const defect of row.defects) {
        if (!isText(defect.id) || defect.status !== 'FIXED' ||
            !/^https:\/\/github\.com\/YuriiSokolenko\/bodich\/pull\/\d+(?:[#/?].*)?$/.test(defect.remediationPr ?? '') ||
            !isRef(defect.retestRef)) {
          fail(errors, row.id + ': unresolved defect or missing remediation PR/retest');
        }
      }
    }
  }

  if (!/^[0-9a-f]{40}$/.test(record.candidateSha ?? '')) fail(errors, 'Exact candidate SHA required');
  if (!/^[0-9a-f]{64}$/.test(record.distManifestSha256 ?? '')) fail(errors, 'Exact dist manifest digest required');
  if (!isText(record.qaLead) || !isText(record.independentReviewer) ||
      samePerson(record.qaLead, record.independentReviewer) ||
      !isDate(record.reviewedAt) || record.reviewedAt > new Date().toISOString().slice(0, 10)) {
    fail(errors, 'Dated named QA lead and independent reviewer required');
  }

  if (isDate(record.reviewedAt)) {
    for (const row of record.rows) {
      if (isDate(row.testedAt) && row.testedAt > record.reviewedAt) {
        fail(errors, row.id + ': QA review precedes device test');
      }
    }
  }

  const lab = record.lab;
  if (!lab || lab.status !== 'PASS' || !Array.isArray(lab.targets) ||
      lab.targets.length !== expectedLab.length ||
      new Set(lab.targets.map((t) => t.id)).size !== expectedLab.length ||
      expectedLab.some((id) => !lab.targets.some((t) => t.id === id))) {
    fail(errors, 'Four unique EN/RO mobile lab targets required');
  } else {
    for (const target of lab.targets) {
      if (target.status !== 'PASS' || !isRef(target.artifactRef) ||
          !Array.isArray(target.runs) || target.runs.length !== REQUIRED_LAB_RUNS) {
        fail(errors, target.id + ': three reproducible runs and raw artifact required');
        continue;
      }
      for (const run of target.runs) {
        if (Object.keys(limits).some((k) => !isMetric(run.metrics?.[k])) ||
            !isText(run.lighthouseVersion) || !isText(run.userAgent) ||
            !isText(run.fetchTime) || !isText(run.file) ||
            run.runtimeError ||
            run.settings?.formFactor !== 'mobile' ||
            !isText(run.settings?.throttlingMethod) ||
            !run.settings?.throttling ||
            !run.settings?.screenEmulation) {
          fail(errors, target.id + ': run lacks recorded lab metrics/browser/network/throttling/config');
        }
      }
      const valid = target.runs.every((r) => Object.keys(limits).every((k) => isMetric(r.metrics?.[k])));
      if (valid) {
        const m = Object.fromEntries(Object.keys(limits).map((k) => [k, median(target.runs.map((r) => r.metrics[k]))]));
        if (m.performance < limits.performance || m.accessibility < limits.accessibility ||
            m.lcpMs > limits.lcpMs || m.cls > limits.cls || m.tbtMs > limits.tbtMs) {
          fail(errors, target.id + ': median budget exceeded');
        }
      }
    }
  }

  const field = record.fieldCwv;
  if (field?.status === 'NO_FIELD_DATA') {
    if (![field.lcpP75Ms, field.inpP75Ms, field.clsP75].every((x) => x == null) || !isText(field.reason)) {
      fail(errors, 'NO_FIELD_DATA must not include synthetic p75 values and must explain absence');
    }
  } else if (field?.status === 'MEASURED') {
    if (!isRef(field.source) || !isText(field.period) || !Number.isInteger(field.samples) ||
        field.samples < 1 || field.sampleEligibility !== 'sufficient' ||
        !isMetric(field.lcpP75Ms) || !isMetric(field.inpP75Ms) || !isMetric(field.clsP75) ||
        field.lcpP75Ms > FIELD_THRESHOLDS.lcpP75Ms ||
        field.inpP75Ms > FIELD_THRESHOLDS.inpP75Ms || field.clsP75 > FIELD_THRESHOLDS.clsP75) {
      fail(errors, 'Field CWV source/sample eligibility and p75 LCP/INP/CLS gate required');
    }
  } else {
    fail(errors, 'Field state must explicitly be MEASURED or NO_FIELD_DATA');
  }
  return errors;
}

const args = process.argv.slice(2);
const matrix = JSON.parse(await readFile(matrixFile, 'utf8'));
if (args.includes('--self-test')) {
  // This positive fixture is generated only in memory. It is synthetic validator
  // test data, never a claim of real devices, accessible hardware, or release GO.
  const good = structuredClone(matrix);
  good.releaseGate = 'GO';
  good.candidateSha = 'a'.repeat(40);
  good.distManifestSha256 = 'b'.repeat(64);
  good.qaLead = 'Fixture QA lead';
  good.independentReviewer = 'Fixture independent reviewer';
  good.reviewedAt = '2026-10-28';
  const reportRef = 'https://github.com/YuriiSokolenko/bodich/issues/69';
  const retestRef = 'restricted:qa/retest/fixture-v1';
  for (const row of good.rows) {
    row.status = 'PASS';
    row.testedAt = '2026-10-26';
    row.tester = 'Fixture original tester';
    row.retester = 'Fixture independent retester';
    row.retestedAt = '2026-10-27';
    row.deviceModel = 'Fixture model';
    row.osVersion = 'Fixture OS 1';
    row.browserVersion = 'Fixture browser 1';
    row.reportRef = reportRef;
    row.retestRef = retestRef;
    row.retest = 'PASS';
    for (const key of Object.keys(row.checks)) if (row.checks[key] !== 'N_A') row.checks[key] = 'PASS';
    for (const key of Object.keys(row.orientations)) row.orientations[key] = 'PASS';
    row.defects = [];
  }
  good.lab.status = 'PASS';
  for (const target of good.lab.targets) {
    target.status = 'PASS';
    target.artifactRef = 'restricted:qa/lighthouse/fixture-v1';
    target.runs = Array.from({ length: REQUIRED_LAB_RUNS }, (_, index) => ({
      iteration: index + 1,
      file: 'lighthouse-' + target.id + '-' + (index + 1) + '.json',
      lighthouseVersion: 'fixture-13',
      userAgent: 'Fixture Chromium',
      fetchTime: '2026-10-26T09:00:00.000Z',
      settings: {
        formFactor: 'mobile',
        throttlingMethod: 'simulate',
        throttling: { rttMs: 150, throughputKbps: 1600 },
        screenEmulation: { mobile: true, width: 390, height: 844 },
      },
      metrics: { performance: 95, accessibility: 98, lcpMs: 1900, cls: 0.04, tbtMs: 120 },
      runtimeError: null,
    }));
  }
  assert.deepEqual(evaluate(good), [], 'Fully complete synthetic fixture MUST be structurally accepted');
  assert.deepEqual(evaluate({ ...good, fieldCwv: {
    status: 'MEASURED', source: reportRef, period: '2026-10-01 to 2026-10-27',
    samples: 500, sampleEligibility: 'sufficient',
    lcpP75Ms: 2000, inpP75Ms: 150, clsP75: 0.05,
  } }), [], 'Valid measured field metrics must be accepted');

  const reject = (name, mutate, expected) => {
    const changed = structuredClone(good);
    mutate(changed);
    assert(evaluate(changed).some((error) => error.includes(expected)), name + ' must be rejected');
  };
  assert(evaluate(matrix).length > 0, 'Unverified NO-GO baseline must have missing evidence');
  reject('missing real device', (x) => { x.rows[0].status = 'NOT_RUN'; }, 'report not PASS');
  reject('mobile screen reader', (x) => {
    x.rows.find((row) => row.platform === 'android-chrome').checks.screenReader = 'NOT_RUN';
  }, 'screenReader');
  reject('missing lab measurements', (x) => { x.lab.targets[0].runs = []; }, 'three reproducible runs');
  reject('extra lab measurements', (x) => {
    x.lab.targets[0].runs.push(structuredClone(x.lab.targets[0].runs[0]));
  }, 'three reproducible runs');
  reject('median budget', (x) => {
    x.lab.targets[0].runs[0].metrics.lcpMs = 3000;
    x.lab.targets[0].runs[1].metrics.lcpMs = 3000;
  }, 'median budget exceeded');
  reject('missing matrix row', (x) => { x.rows.pop(); }, '10 rows');
  reject('duplicate row ids', (x) => { x.rows[1].id = x.rows[0].id; }, '10 rows');
  reject('identical QA reviewers', (x) => { x.independentReviewer = x.qaLead; }, 'independent reviewer');
  reject('missing digest', (x) => { x.distManifestSha256 = null; }, 'dist manifest digest');
  reject('malformed report reference', (x) => { x.rows[0].reportRef = 'https://example.org/private'; }, 'evidence reference');
  reject('future test', (x) => { x.rows[0].testedAt = '2099-01-01'; }, 'future test date');
  reject('future QA review', (x) => { x.reviewedAt = '2099-01-01'; }, 'independent reviewer');
  reject('QA review before tests', (x) => { x.reviewedAt = '2026-10-25'; }, 'QA review precedes');
  reject('non-independent retest', (x) => { x.rows[0].retester = x.rows[0].tester; }, 'independent retest');
  reject('retest before initial test', (x) => { x.rows[0].retestedAt = '2026-10-25'; }, 'independent retest');
  reject('identical evidence reused as retest', (x) => { x.rows[0].retestRef = x.rows[0].reportRef; }, 'independent retest');
  reject('unresolved defect', (x) => { x.rows[0].defects = [{ id: 'BUG-1', status: 'OPEN' }]; }, 'unresolved defect');
  reject('invalid measured INP', (x) => { x.fieldCwv = {
    status: 'MEASURED', source: reportRef, period: 'Oct 2026', samples: 500,
    sampleEligibility: 'sufficient', lcpP75Ms: 1800, inpP75Ms: 250, clsP75: 0.03,
  }; }, 'Field CWV');
  reject('ineligible field sample', (x) => { x.fieldCwv = {
    status: 'MEASURED', source: reportRef, period: 'Oct 2026', samples: 1,
    sampleEligibility: 'insufficient', lcpP75Ms: 1800, inpP75Ms: 140, clsP75: 0.03,
  }; }, 'Field CWV');
  reject('fabricated field INP', (x) => { x.fieldCwv.inpP75Ms = 150; }, 'synthetic p75');
  assert.equal(median([1, 3, 5, 7]), 4, 'Even-count median must not select optimistic upper middle');
  console.log('Issue 69 positive and negative evidence fixtures passed (GO reachable only with complete synthetic evidence).');
} else {
  const errors = evaluate(matrix);
  if (matrix.releaseGate === 'GO' && errors.length) {
    throw new Error('Invalid GO declaration:\n' + errors.join('\n'));
  }
  if (args.includes('--require-go') && (matrix.releaseGate !== 'GO' || errors.length)) {
    throw new Error('QA release gate NO-GO:\n' + errors.join('\n'));
  }
  console.log(matrix.releaseGate === 'GO'
    ? 'Issue 69 evidence is structurally complete; human authenticity and release authorization remain separate.'
    : 'Issue 69: NO-GO (' + errors.length + ' outstanding evidence checks). This is expected until real human testing.');
}
