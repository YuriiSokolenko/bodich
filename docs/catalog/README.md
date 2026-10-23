# Verified catalog intake

The website intentionally has no published product records yet. This guide prepares an approval workflow for real BODICH model photos and descriptions. Provisional categories and AI concept art must never be presented as confirmed stock or product photography.

## Approval checklist

1. Collect an authoritative BODICH manufacturer document, official page, or reviewable internal company reference. Verify that the proposed name, category and bilingual summaries are supported. Record the reference and the actual verification date in the intake JSON. A filled sourceReference field is not by itself proof of authenticity.
2. Obtain permission to publish the photograph: document ownership or a license, check model identity, remove private EXIF/location metadata, and optimize for web. The source must be a genuine approved BODICH product photo, not a concept render, logo or a competitor image.
3. Store authorized public images under public/images/catalog/<model-slug>/ using descriptive PNG, JPEG or WebP filenames (WebP preferred). Record the true pixel dimensions, English/Romanian alt text and path starting with /images/catalog/. If there is no approved photo, omit the image object; the site shows a localized no-photo state.
4. Copy intake-template.json to a **local untracked location** such as /tmp/model-review.json. Fill its required id, slug, existing categoryId, both language descriptions, and verification.sourceReference and verification.confirmedOn (YYYY-MM-DD, not in the future).
5. If adding a photo, add an image object with fields: src (for example /images/catalog/<model-slug>/front.webp), alt (object with en and ro strings), width (positive integer), height (positive integer).
6. Run: npm run catalog:intake -- /tmp/model-review.json. A successful result means that the shape, date, uniqueness versus current confirmed products, translations, approved photo-directory path and file presence checks passed. **It does not attest to the actual source, photographic rights or factual accuracy.**
7. Have an authorized company reviewer verify the evidence, photo rights and localized copy. Do not commit confidential documents or internal evidence to a public GitHub repository.
8. Only after sign-off, copy the validated JSON product object as a TypeScript object into the confirmedProducts array in src/catalog/data.ts between BEGIN CONFIRMED PRODUCTS and END CONFIRMED PRODUCTS.
9. Run npm run check, npm run build and node scripts/validate-catalog.mjs --routes dist, then open a review PR. The product card and both localized detail URLs are generated automatically from the confirmed record.

## Explicitly out of scope

The published site must not invent or infer products, prices, performance specifications, certification, stock, warranty or delivery details. No payment or order flow is enabled. Final tests on physical devices and Safari/Firefox and the native Romanian copy pass are deferred to prelaunch.

The checked-in intake template has deliberately blank required fields; it is not a product and cannot pass validation until authoritative information is supplied. Temporary CI fixture products are generated only in disposable copies for testing.
