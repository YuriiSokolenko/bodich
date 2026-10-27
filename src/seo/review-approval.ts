/**
 * Shared data-only approval logic for Astro and Node 24 CI.
 * Synthetic tests never modify the real corporate review matrix.
 */
export const editorialPageKeys = ['home', 'products', 'accessories', 'support', 'about', 'contact'] as const;
export const editorialGates = ['english', 'romanian', 'technical', 'legal', 'media', 'accessibility', 'seo'] as const;
export type EditorialPageKey = (typeof editorialPageKeys)[number];
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type EditorialReview = Record<(typeof editorialGates)[number], ReviewStatus> & {
  reviewedBy: string;
  reviewRecord: string;
};
export type EditorialReviewMatrix = { schemaVersion: 2; pages: Record<EditorialPageKey, EditorialReview> };

// This format check cannot establish that a real, independent human approved.
// CODEOWNERS and protected-branch reviews must be enforced outside this code.
const reviewEvidence = /^https:\/\/github\.com\/YuriiSokolenko\/bodich\/pull\/[1-9]\d*#pullrequestreview-[1-9]\d*$/;
export function hasHumanEditorialApproval(record: unknown): boolean {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const row = record as Record<string, unknown>;
  return editorialGates.every((gate) => row[gate] === 'approved')
    && typeof row.reviewedBy === 'string' && row.reviewedBy.trim().length > 0
    && typeof row.reviewRecord === 'string' && reviewEvidence.test(row.reviewRecord);
}
export function eligibleInformationPages(matrix: { pages?: Record<string, unknown> } | null): EditorialPageKey[] {
  if (!matrix || !matrix.pages) return [];
  return editorialPageKeys.filter((page) => hasHumanEditorialApproval(matrix.pages?.[page]));
}
export function editorialReviewProblems(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['review matrix must be an object'];
  const data = raw as Record<string, unknown>;
  if (data.schemaVersion !== 2) errors.push('matrix schemaVersion must be 2');
  if (!data.pages || typeof data.pages !== 'object' || Array.isArray(data.pages))
    return [...errors, 'matrix pages must be an object'];
  const pages = data.pages as Record<string, unknown>;
  if (JSON.stringify(Object.keys(pages).sort()) !== JSON.stringify([...editorialPageKeys].sort()))
    errors.push('matrix page keys differ');
  for (const page of editorialPageKeys) {
    const row = pages[page];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(page + ': missing review'); continue;
    }
    const entry = row as Record<string, unknown>;
    if (JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify([...editorialGates, 'reviewedBy', 'reviewRecord'].sort()))
      errors.push(page + ': unexpected review fields');
    for (const gate of editorialGates) {
      if (!['pending', 'approved', 'rejected'].includes(entry[gate] as string))
        errors.push(page + ': invalid status for ' + gate);
    }
    if (typeof entry.reviewedBy !== 'string' || typeof entry.reviewRecord !== 'string') {
      errors.push(page + ': invalid reviewer evidence');
    } else if (editorialGates.some((gate) => entry[gate] === 'approved') &&
      (!entry.reviewedBy.trim() || !reviewEvidence.test(entry.reviewRecord))) {
      errors.push(page + ': approved gate requires reviewer and permalink');
    }
  }
  return errors;
}
