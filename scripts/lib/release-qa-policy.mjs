// Shared Stage 20D policy for lab generation and release evidence validation.
// Keep human-facing thresholds in docs/qa/issue-69-accessibility-performance.md aligned.
export const AXE_TAGS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
export const REQUIRED_LAB_RUNS = 3;
export const LAB_THRESHOLDS = Object.freeze({
  performance: 90,
  accessibility: 95,
  lcpMs: 2500,
  cls: 0.1,
  tbtMs: 200,
});
export const FIELD_THRESHOLDS = Object.freeze({
  lcpP75Ms: 2500,
  inpP75Ms: 200,
  clsP75: 0.1,
});

// Conventional midpoint median, not an optimistic upper-middle selection.
export function median(values) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isFinite)) {
    throw new Error('Median requires non-empty finite numeric samples');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
