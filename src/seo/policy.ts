import { pageKeys, type PageKey } from '../i18n';
import reviewMatrix from '../../docs/editorial/review-matrix.json';

type ReviewRecord = {
  english: string;
  romanian: string;
  technical: string;
  legal: string;
  media: string;
  reviewedBy: string;
  reviewRecord: string;
};

/** Only information-page reviews; product publication is a separate Stage 13/14 gate. */
export function hasHumanEditorialApproval(record: ReviewRecord | undefined): boolean {
  if (!record) return false;
  return ['english', 'romanian', 'technical', 'legal', 'media'].every(
    (gate) => record[gate as keyof ReviewRecord] === 'approved',
  ) && record.reviewedBy.trim().length > 0
    && /^https:\/\/github\.com\/YuriiSokolenko\/bodich\/(issues|pull)\/\d+(?:[\/#?]|$)/.test(record.reviewRecord);
}

export function indexableInformationPages(): PageKey[] {
  return pageKeys.filter((page) => hasHumanEditorialApproval(reviewMatrix.pages[page]));
}

/** Never index nested category or product routes via a corporate editorial signoff. */
export function isIndexableInformationPage(page: PageKey, subpath?: string): boolean {
  return !subpath && indexableInformationPages().includes(page);
}
