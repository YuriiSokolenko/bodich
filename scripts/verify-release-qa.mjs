import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const matrixFile = new URL('../docs/qa/issue-69-matrix.json', import.meta.url);
const expectedPlatforms = ['android-chrome', 'iphone-safari', 'desktop-chromium', 'desktop-firefox', 'macos-safari'];
const expectedRows = expectedPlatforms.flatMap((platform) => ['en', 'ro'].map((locale) => platform + '-' + locale));
const expectedLab = ['en-home', 'en-products', 'ro-home', 'ro-products'];
const requiredChecks = ['keyboard', 'images', 'semanticControls', 'zoom', 'reducedMotion', 'languageSwitch', 'wcag22AA', 'axe'];
const limits = { performance: 90, accessibility: 95, lcpMs: 2500, cls: 0.1, tbtMs: 200 };
const isText = (value) => typeof value === 'string' && value.trim() !== '' && !/^(tbd|unknown|pending|n\/a)$/i.test(value.trim());
const isRef = (value) => isText(value) &&
  (/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/(?:actions\/runs\/\d+|issues\/\d+|pull\/\d+)(?:[#/?].*)?$/.test(value) ||
   /^restricted:[A-Za-z0-9_.:/-]{8,}$/.test(value));
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
  new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const isMetric = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
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
    if (row.retest !== 'PASS' || !isRef(row.retestRef)) fail(errors, row.id + ': retest evidence missing');
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
  if (!isText(record.qaLead) || !isText(record.independentReviewer) ||
      record.qaLead?.trim().toLocaleLowerCase() === record.independentReviewer?.trim().toLocaleLowerCase() ||
      !isDate(record.reviewedAt)) {
    fail(errors, 'Dated named QA lead and independent reviewer required');
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
          !Array.isArray(target.runs) || target.runs.length < 3) {
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
        field.lcpP75Ms > 2500 || field.inpP75Ms > 200 || field.clsP75 > 0.1) {
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
  const baseline = evaluate(matrix);
  assert(baseline.length > 0, 'Unsigned baseline must remain NO-GO');
  assert(baseline.some((x) => x.includes('screenReader')), 'Must require real screen-reader coverage');
  assert(baseline.some((x) => x.includes('three reproducible runs')), 'Must require three Lighthouse runs');
  const missingRow = structuredClone(matrix);
  missingRow.rows.pop();
  assert(evaluate(missingRow).some((x) => x.includes('10 rows')));
  const fakeField = structuredClone(matrix);
  fakeField.fieldCwv.inpP75Ms = 150;
  assert(evaluate(fakeField).some((x) => x.includes('synthetic p75')));
  const fakeApproval = structuredClone(matrix);
  fakeApproval.releaseGate = 'GO';
  assert(evaluate(fakeApproval).length > 0, 'GO cannot bypass missing evidence');
  console.log('Issue 69 evidence self-tests passed (blocked baseline, screen reader, three-run lab, matrix completeness, field integrity and false GO).');
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
