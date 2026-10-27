# Stage 17 — bilingual content, provenance and SEO publication policy

**Status: editorial review pending.** This issue adds original EN/RO educational and site-preview text, but no human signoff is asserted. It does not release a product, certify BODICH as a manufacturer, grant media rights, or approve an order/contact channel.

## Editorial source labels and allowed treatment

| Source class | Public presentation | Evidence and approval |
| --- | --- | --- |
| **General educational explanation** | Original text may explain high-level turbine principles, component roles and terminology. Label it as general education, not installation/safety advice. | Technical subject-matter review required before indexability. Do not copy supplier descriptions. |
| **KingTech supplier reference** | Keep source identifiers, unreviewed specification data, draft copy and photos in non-public audit/review material; do not turn them into BODICH offerings. | Stage 13/14 SKU/evidence ledger and authorized publication gate. Source data alone cannot authorize a BODICH claim. |
| **AI-generated BODICH concept** | Only show in the explicitly configured presentation-beta workflow, with prominent localized concept disclosure. | Stage 15 media provenance and rights review remain pending. Concepts are not photographs or proof of a specific model. |
| **Future verified BODICH product** | Only show a public product record when independent identity, technical evidence, publication rights, category and EN/RO information pass the established release pipeline. | Separate Stage 13/14 product approval; Stage 17 must not bypass it. |
| **Corporate or commercial claim** | Withhold until company identity, manufacturing relationship, contact ownership and applicable terms are documented. | Named human legal/commercial approval and traceable evidence required. |

Never claim a specific thrust, fuel rate, certification, test result, warranty term, price, stock status, manufacturing location, after-sales coverage, or permission to distribute another brand's media without independent, product-specific evidence. Educational descriptions must not be presented as operating instructions.

## Editorial review ledger (not the SKU review ledger)

The machine-readable status is [review-matrix.json](review-matrix.json). Each of Home, Products, Accessories, Support, About and Contact starts with five **pending** checks: English writing, native Romanian, technical accuracy, legal/commercial claims and media rights. The `reviewedBy` and `reviewRecord` fields are empty.

Only a named authorized human may mark a gate approved, with a review record link in this repository. Reviewers must inspect the **actual rendered EN and RO pages**, not merely the original text. A rejected or pending gate blocks both locales from indexing, preserving EN/RO parity. Do not populate review fields or fabricate approvals from scripts, models or test fixtures.

Review checklist (all outstanding, not completed):

- [ ] **Native Romanian editor:** technical terminology, diacritics, idiomatic phrasing, capitalization, clarity, links and FAQ answers.
- [ ] **English editor:** independently written prose, consistency between headings, page descriptions and factual meaning.
- [ ] **Technical reviewer:** turbine-cycle statements, terminology, safe high-level scope; no implied compatibility or operational instructions.
- [ ] **Commercial/legal reviewer:** verified legal entity, trademark and supplier relationship; no unapproved manufacturing, warranty, certification, performance, price, stock or support commitments.
- [ ] **Media-rights reviewer:** provenance and publication rights for every visible image, including beta concept illustrations and any third-party media.
- [ ] **Accessibility/UX reviewer:** heading sequence, meaningful image alt text, accurate bilingual source labels, descriptive internal links, keyboard navigation and small-screen readability.
- [ ] **SEO reviewer:** chosen real `SITE_URL`, locale parity, metadata quality, canonical/hreflang paths, sitemap/robots settings, structured data accuracy, and search-engine launch decision.

**Required evidence:** a recorded review discussion or PR URL, the reviewer identity, scope, approval date, and supporting primary evidence in the appropriate private/public record. Public approval record URLs are not a substitute for actual rights or legal clearance.

## Technical SEO guardrails

- `SITE_URL` is optional and must be set only to a confirmed production origin when publishing. Setting it for CI previews adds canonical/hreflang links **but does not authorize indexing**.
- The `src/seo/policy.ts` allowlist reads the separate corporate review matrix. All five checks and a named review are required for **both languages**. Category/product paths are never opened by a corporate page approval.
- `robots.txt` denies all routes unless a real canonical site is configured and an information page is fully reviewed. Explicit allow rules are anchored to the exact corporate page URL.
- `sitemap.xml` contains only reviewed EN/RO information pages. Today it is intentionally empty; no supplier/reference SKU or private review path belongs in a sitemap.
- Page-level `noindex, nofollow, noarchive` is retained until human approval. Generic `WebPage` JSON-LD is generated only for a reviewed page on a configured site; neither `Product` nor `Organization` claims are synthesized.
- The private catalog review pages and frozen-epoch files are not altered. This editorial review is **not** a Stage 13/14 review-ledger migration.

## Regression checks and release

`npm run seo:self-test` tests fail-closed editorial approval fixtures, including partial/rejected reviews and bogus evidence. `npm run seo:routes` checks the built pages for unique EN/RO metadata, local navigation, language links, heading structure, source labels, image alt text, indexability, canonical URLs, sitemap, robots, schema and prohibited audit artifacts. CI runs it on release-safe, non-root and beta builds. Production and mobile-browser visual QA plus independent human review are still required before launch.

Related: #1 (roadmap), #24 (catalog), #49 (frozen review ledger), #55 (media policy), #56 (site UX), #57 (this stage).
