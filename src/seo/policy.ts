import type { PageKey } from '../i18n';
import reviewMatrix from '../../docs/editorial/review-matrix.json';
import { eligibleInformationPages, hasHumanEditorialApproval } from './review-approval';
export { hasHumanEditorialApproval };
/** Corporate editorial approval is separate from Stage 13/14 SKU approval. */
export function indexableInformationPages(): PageKey[] {
  return eligibleInformationPages(reviewMatrix) as PageKey[];
}
export function isIndexableInformationPage(page: PageKey, subpath?: string): boolean {
  return !subpath && indexableInformationPages().includes(page);
}
/** Nested base cannot place robots.txt at host root; never enable indexing. */
export function isSeoPublicationContext(site: URL | undefined, profile: string, base: string): boolean {
  return Boolean(site) && profile === 'release_safe' && base === '/';
}
