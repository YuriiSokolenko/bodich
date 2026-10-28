# ADR-001 — Future BODICH commerce readiness (planning only)

- **Status:** PROPOSED / BLOCKED — **not approved for implementation or public sales**
- **Date:** 2026-10-28
- **Issue:** [#61](https://github.com/YuriiSokolenko/bodich/issues/61); parent [#1](https://github.com/YuriiSokolenko/bodich/issues/1); catalog epic [#24](https://github.com/YuriiSokolenko/bodich/issues/24)
- **Prerequisites:** genuine-product evidence and human sign-off [#59](https://github.com/YuriiSokolenko/bodich/issues/59); authorized informational release decision [#60](https://github.com/YuriiSokolenko/bodich/issues/60) / [#71](https://github.com/YuriiSokolenko/bodich/issues/71); **separate commerce implementation approval**
- **Decision authority:** actual BODICH business/legal operator **TBD**; technical owner **TBD**; independent legal/tax/payments/shipping/rights reviewers **TBD**
- **Nature of record:** architecture and discovery questions only. Technical descriptions are *future, unimplemented contracts*, not obligations, guarantees, inventories, offers, approvals or legal advice.

## Context and decision

BODICH currently uses an Astro static EN/RO informational site with a closed Cloudflare Pages release-safe route allow-list. The 132 KingTech records are unpublished supplier *references*, not BODICH merchandise. The Stage 18 internal BODICH product registry presently has zero genuine registered products, and the #59 evidence pilot is externally blocked. #60/#71 separately gate whether the **informational** site may be published; informational GO is not authorization to sell.

**Decision:** keep the entire current website static, non-transactional and closed to commerce. Evaluate a **separately operated commerce service using a vendor-hosted checkout** as the preferred architecture *for comparison*, not a selected vendor or an authorization to integrate. Retain Astro as an informational/presentation frontend unless a future ADR, approved business requirements and a separate implementation PR justify changing it. Prefer a checkout arrangement in which BODICH never receives or handles raw cardholder data; the final PCI scope must be assessed for the exact integration. The seller, market, provider and launch date are all **TBD**.

This ADR adds **no** cart/checkout/order/price/stock/warranty UI, API, domain, redirect, credentials, dependencies, integration, tracking, backend, sales schema, webhook or deployment. Do not widen `config/pages-release-allowlist.json`, `confirmedProducts`, SEO indexing or preview exposure under #61. A merge of documentation is **not** a commerce GO decision.

## 1. Business discovery and external approval ledger

All entries are currently **TBD / BLOCKED**. The named role identifies who must supply *independently attributable* evidence and authorize the decision, not an assigned individual. Record actual reviewer identity, date, approved scope, document version and off-repo `restricted:` evidence reference only after genuine review; a public link or an opaque reference alone proves nothing.

| Gate / missing decision | Accountable human role | Evidence and required decision before implementation |
| --- | --- | --- |
| Legal seller and brand/trademark/manufacturer/distribution authority | Authorized BODICH business operator + rights counsel | Actual legal entity, registration and permitted trading name, contracting seller, brand/product rights; exact permitted EN/RO disclosures (**TBD**) |
| Markets, audience and product classification | Business owner + qualified local counsel | Explicit ship-to/sell-to countries and consumer vs business use, product classification, applicable safety/labeling instructions and cross-border obligations (**TBD**) |
| VAT, invoicing, customs and financial records | Qualified tax adviser + finance owner | Entity jurisdiction, VAT registration, place-of-supply rules, exemptions, invoice content/numbering, currency, reconciliation, import/export tax and retention (**TBD**) |
| Selling terms, returns and warranty | Qualified consumer/commercial counsel | Jurisdiction-specific precontract disclosures, withdrawal/cancellation and exceptions if applicable, returns address/cost, statutory conformity rights, seller warranty *if any*, dispute/support process (**TBD**) |
| Shipping, product safety and export controls | Logistics owner + product-safety/trade adviser | Carriers and serviceability per region/SKU; batteries, oils, fuels or turbine-related dangerous-goods restrictions where applicable; sanctions, export/licence checks, packaging and delivery/returns capacity (**TBD**) |
| Approved product and publication rights | Product/rights authority + independent Stage 13/14 reviewers | Exact real BODICH identity, per-variant specs, authentic authorized images, EN/native-RO/legal/commercial copy, current proof and distinct publication PR (#59, #58); none established |
| Commerce technology, payment and settlements | Technical owner + finance/security/payment reviewer | Provider eligibility for **actual seller country**, allowed product categories, acquiring/PSP acceptance, settlement currencies, payout/fees/timing, refunds, disputes, 3-D Secure/SCA and integration restrictions (**TBD**) |
| Privacy, fraud, operations and support | Controller/privacy counsel + security/operations owner | Controller/processor roles, lawful bases, DPA/transfer, retention & deletion, support hours, refund/incident SLAs, escalation, recovery ownership, DPIA necessity (**TBD**) |
| Operational budget and support capacity | Business owner + technical owner | Expected catalog/order volume, total cost of ownership, staffing, service-level targets, backup/restore budget and exit plan (**TBD**) |
| Production and launch authorization | Site release authority + **separate** commerce release authority | Real #60/#71 informational GO, separate signed commerce GO for exact deployment and merchant account, tested payments and rollback; both presently absent |

**Handling unknowns:** Do not replace TBD with an inferred Romanian, Albanian or EU incorporation, shipping destination, PSP eligibility, price or tax rule based on the languages or development location. Legal, tax and trade reviews are human responsibilities. Relevant local regulations must be checked for the *actual* seller, destination, goods and effective date.

## 2. Alternatives and verifiable vendor requirements

These are **research candidates**, not commercially validated vendors. Primary vendor documentation is linked so the business/technical reviewers can perform a dated, account-specific assessment. Do **not** assume onboarding is available for an unknown legal entity or that a payment feature is active on a particular plan/region.

| Option | Fit / strengths | Tradeoffs and decision blockers | Primary documentation |
| --- | --- | --- | --- |
| **A. Astro + managed headless commerce (e.g. Shopify)** | Reuse Astro presentation; provider operates catalog/order/checkout core and Storefront cart/checkout handoff | Extra frontend integration and platform dependency; merchant-country and product eligibility, checkout ownership, tax, fees, product-channel publication, multilingual flows, inventory and refunds all **TBD** | [Shopify headless architecture](https://shopify.dev/docs/storefronts/headless/overview), [cart and checkout URL](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage) |
| **B. Astro + self-operated commerce backend (e.g. Medusa)** | Independent product/order/payment modules and more business-process flexibility | BODICH would operate secure API/data infrastructure, upgrades, operational support, backups, fraud/webhooks and availability; much larger maintenance burden | [Medusa commerce modules](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules), [payment module](https://docs.medusajs.com/resources/commerce-modules/payment) |
| **C. Managed WordPress/WooCommerce store, linked from Astro or migrating storefront** | Broad plugin/gateway choice and familiar merchant administration | Separate stack/hosting or duplicate editorial systems; extension/security lifecycle, backup and gateway/PCI responsibilities; Astro UX/navigation discontinuity risk | [WooCommerce payment gateway API](https://developer.woocommerce.com/docs/features/payments/payment-gateway-api/) |
| **D. Custom cart/order service + hosted PSP checkout (e.g. Stripe Checkout)** | Flexible contracts and hosted payment UI if provider supports the verified merchant | PSP is **not** a catalog/inventory/tax/fulfillment system. Requires an independently built, audited server-side order engine and reconciliation; onboarding and legal reach unknown. Do not treat a payment link as order validation | [Stripe hosted Checkout](https://stripe.com/payments/checkout), [PCI guidance](https://stripe.com/guides/pci-compliance) |
| **E. Remain informational / no commerce** | Zero order/payment/PII expansion; matches present approval state | Cannot transact until all external gates and a distinct implementation/release approval | [Current release allow-list](../../config/pages-release-allowlist.json) |

**Provisional preference:** compare **A vs E** first after business gates are satisfied; B/C/D remain explicit alternatives. There is **no final vendor selection**, purchase approval or committed schedule. A commercial requirements review could select a different provider or cancel commerce entirely. Managed checkout does not remove merchant privacy, consumer-law, tax, security or PCI obligations.

For each finalist, require documented, dated evidence for: seller-country account eligibility; permitted turbine/accessory categories; target markets and sanctions restrictions; API and hosted-checkout accessibility and EN/RO localization; price/currency/tax/invoice semantics; per-variant stock reservations; refunds and partial cancellations; return and dispute interfaces; webhook signing/idempotency; SCA/3-D Secure; role-based admin and MFA; audit log and data export/deletion; residency/DPA/subprocessors; support response times; backup, restore and migration/exit; sandbox access and total costs. Mark unsupported capabilities and unspecified contractual terms **TBD**, not passes. Recheck documentation, provider contract and product availability on the actual selection date.

### Decision criteria — to be scored only after evidence exists

1. **Hard no-go**: unverified seller, prohibited goods/region, no rights, no legally usable payment service, no safe refund/fulfillment path or insufficient consumer/privacy controls.
2. **Operational risk**: authenticated administrative access, PCI scoping, fraud controls, incident/recovery ownership, versioning, lock-in and security monitoring.
3. **Fit**: catalog and variant model, EN/RO, actual target market/currency, tax/shipping and BODICH approval-to-sale control.
4. **Cost/maintainability**: recurring/provider fees, transaction/refund/dispute cost, implementation load, runtime ownership and support commitments.
5. **Reversibility**: public URL stability, product/transaction data portability, provider failure mode and rollback strategy.

No numerical vendor score or purported legal sign-off is fabricated here.

## 3. Publication and approval-to-sale boundary (future contract, NOT code)

**No commerce source of truth exists today.** Existing records and security boundaries must not be conflated:

1. **Unpublished source reference** (`kt-*`): research only; cannot be sold, copied into a commerce API, mapped to a public product or priced.
2. **Proposed actual BODICH product** (`bdc-*` with independently identified `bdv-*` variants): Stage 18 internal metadata, no commercial entitlement; current registry is empty.
3. **Evidence-verified, human-reviewed product**: *eligibility only* after current-epoch Stage 13 ledger decisions, genuine Stage 14 model-/variant-bound proofs, correct rights, verified claims and EN/RO/legal/commercial copy. Even this does not create a listing.
4. **Separately approved public publication**: explicit reviewed publication PR and editorial/SEO/media/build gates. **Publication does not equal permission to sell.**
5. **Commerce-eligible variant (future distinct decision)**: require (3) and (4) PLUS verified legal seller, approved market/product-class jurisdiction, merchant/payment eligibility, current prices/taxes, permitted warranty/returns and logistics, valid stock policy and separately signed commerce authorization for this *specific variant, market and channel*. Current count = **0**.
6. **Sellable listing**: an approved commerce operator explicitly enables the eligible variant in the selected merchant channel, after an independent deploy gate. On rights revocation, evidence expiry, regulatory/stock issue, stale copy or a withdrawn commerce decision, **disable selling first**, then review display and reconciliation.

A future adapter must **fail closed** if any gate cannot be revalidated and must bind listing-to-variant identity and immutable evidence/approval revision. Never automatically sync `kt-*`, internal product registry JSON, supplier Square links, gift cards, warranty-transfer references or beta concepts to a sales platform. No automated publishing from a Git merge. The actual enforcement design and data mapping require a separate implementation design review.

### Proposed conceptual data ownership (unimplemented)

| Domain | Fields/constraints for later design | Owner/source of truth |
| --- | --- | --- |
| Product identity and rights | Stable product/variant IDs, source evidence versions, publication and rights decisions; no supplier inference | Existing Stage 13/14/18 approval chain + independently reviewed publication |
| Sales eligibility | Variant, allowed region/channel, effective/expiry, evidence digest, authorizing human, revocation reason; default denied | **Future** commerce authorization service, never a side effect of the review ledger |
| Offer and price | Currency + amount in minor units, tax display rule, validity window, origin, independent commercial approval; no values supplied here | **Future** merchant/finance catalog |
| Inventory | Warehouse/location, on-hand, reserved, available-to-sell, reservation TTL, backorder policy; never infer stock from a supplier reference | **Future** inventory/fulfillment authority |
| Warranty and returns | Jurisdiction, seller obligations and approved terms/version, effective date, support route; never infer a duration or guarantee | **Future** counsel-approved policy |
| Order | Opaque order ID, immutable item/price/tax/shipping/terms snapshot, status history, authorized actions; no live orders exist | **Future** order system/managed provider |
| Payment | Processor-owned payment ID, amount/currency, authorization/capture/refund status, reconciled events; no PAN/CVV | **Future** PSP with exact integration risk review |

**Conceptual state model (not a promise of provider behavior):** an order may move `initiated → awaiting_payment → paid → fulfillment_pending → fulfilled`, with `cancelled`, `payment_failed`, `partially_refunded`, `refunded`, `disputed` or `exception_requires_review` paths. A **server-verified** payment event, not a browser return page, is needed to transition to paid; fulfillment must not run twice. Enforce valid transitions and race handling through the future provider's actual semantics. Partial shipments, split payments, failed refunds, chargebacks, no-stock and cross-border returns require explicit acceptance tests before selection.

## 4. Future security, privacy and operational architecture

**Proposed boundary:** Astro informational site → reviewed commerce adapter/storefront boundary → merchant-managed catalog/order/stock → provider-hosted checkout → signed backend-to-backend payment events → order/fulfillment reconciliation. Each boundary is unimplemented, and there is currently no network connection or merchant backend.

- **Transactions:** server-side catalog/region/price/tax/stock revalidation before an order or payment session; never trust browser amounts, product IDs or redirect destinations. Restrict return/checkout URLs to registered provider origins. Authenticate and authorize admin/order APIs; deny by default.
- **Payments and PCI:** prefer full-page vendor-hosted checkout. Never collect card numbers/CVV in Astro, logs, GitHub, CDN analytics or a self-hosted form. Independent security/PSP reviewers must confirm merchant PCI DSS obligations and SAQ eligibility for the exact deployment (do **not** claim "PCI-free"). Complete SCA/3DS and redirect-recovery testing where required.
- **Event integrity:** verify provider event signatures against raw payloads using secrets in managed secret storage; enforce expiry/replay rules and durable deduplication/idempotency. Retried, reordered, late and contradictory events must not double-capture, double-refund or double-fulfill. Reconcile payment captures, settlements, fees and refunds against order ledger and finance records, with alerts on divergence.
- **PII minimization:** collect only buyer/delivery/tax data demonstrably needed for the approved flow; define controller/processor and DPA, lawful basis, retention/deletion and subject-request handling by market. Encrypt in transit/at rest, restrict staff access, redact logs, define separate staging/test fixtures and prohibited data in CI artifacts. No analytics, pixels or new cookies until actual privacy/consent determination.
- **Fraud and abuse:** PSP risk controls, rate limits, bot protection as appropriate, operator-managed manual review/holds, dispute handling and anti-fraud false-positive review without undisclosed blanket claims. Audit all admin pricing/refund/fulfillment actions.
- **Operations:** actual named on-call owner; monitored checkout success, order/event lag, payment reconciliation and fulfillment exceptions; recovery objectives **TBD**; encrypted backups and restore drills for all *self-operated* state; provider export/exit plan. Document provider outage, security incident, personal-data breach, rights revocation and bad-listing playbooks. Preserve immutable sanitized audit history.
- **Secret isolation and environments:** separate sandbox vs live merchant accounts, webhook endpoints, least-privilege keys with rotation, no secrets in static bundles or public repository. No live payment attempt during build/CI. Staging must not route to production payments or emit real notifications.
- **Deploy/rollback:** commerce feature flag defaults OFF at server/provider layer; storefront route visibility is not sufficient. Independently verify orders/payouts, then apply controlled roll-forward/rollback and emergency **disable-sales** control. Rolling back Astro alone cannot cancel active merchant-side listings, orders or payments. Document how to stop selling without erasing financial records.

## 5. Migration from today's Astro site — future stages only

**Stage 0 (current, unchanged):** Node 24/Astro static release-safe build, EN/RO informational routes, `src/catalog/data.ts` confirmed product approval, and exact Pages route allow-list. There must be no purchasable listing, order API or externally enabled payment link. `#59` remains blocked and `#60/#71` informational NO-GO until authorized evidence exists.

**Stage 1 (business discovery):** actual seller and markets; independent legal/tax/safety/trade/shipping/payment/rights reviews; vendor demos with *synthetic* products only and written eligibility evidence. This remains outside production and outside the BODICH site repository.

**Stage 2 (separate approved implementation epic):** a new issue/epic, ADR acceptance, reviewed contracts and ownership decision; explicit design for build-time vs server-rendered commerce boundaries and Cloudflare compatibility, service/data topology, signed provider events, sandbox, secret storage, publish/sell gates and domain routing. Amend publication allow-lists, headers/CSP, legal and privacy posture only in independently reviewed diffs.

**Stage 3 (staging, fail closed):** a deliberately isolated non-indexable commerce staging environment containing only synthetic products and test-payment accounts. Prove unauthorized `kt-*` and unpublished `bdc-*` variants cannot appear as purchasable. Never use beta concept artwork as verified photography. Validate locale parity, accessible checkout handoff and link safety on real browsers.

**Stage 4 (human-controlled release):** genuine per-variant Stage 13/14/18/product publication evidence, actual informational site GO (#60/#71), separately signed commerce GO, finance/rights/legal/security/QA approvals for exact build and merchant configuration, production reconciliation/disable-sales/rollback runbook. Start with an explicitly approved limited scope only if all gates pass; no auto-activation.

**Stage 5 (operations and exit):** monitor reconciled transactions, returns, delivery, complaints, compliance drift and rights expiry. Maintain emergency stop for newly sellable inventory and a reviewed provider migration/export plan without duplicating orders or silently republishing drafts.

**Separation rule:** a future commerce approval cannot retroactively turn informational #71 GO, Stage 13 review, Stage 18 verified status or CI success into a seller's legal/financial authorization.

## 6. Validation and acceptance boundaries

### For *this documentation-only PR*

- Review the **source-controlled** Pages release allow-list and its existing route/dist leak checks in `scripts/verify-pages-release.mjs`. Confirm the unchanged site has no new `/cart`, `/checkout`, payment/order endpoint, public prices/stock/warranty terms or buy CTA. Source inspection alone does **not** assert anything about a deployed merchant or CDN.
- Run the existing Node 24 static checks on the PR's exact commit: `npm ci`, `npm run check`, `npm run build`, `npm run pages:self-test`, `npm run pages:verify`, `npm run catalog:products:dist`, `npm run catalog:reconcile:routes`, `npm run seo:routes`, `npm run legal:dist`, `npm run release:decision:verify`. Required workflow Gitleaks and release-safe/non-root audits remain in force.
- Inspect the PR diff: **documentation only**, no changes to `src/`, `scripts/`, `config/`, `package.json`, runtime dependencies, GitHub deployment workflows or public assets. No secrets, personal seller data, contracts, payment URLs or simulated approval signatures.
- Distinguish a passing **technical NO-GO audit** from human GO: #67 and #71 evidence reviews are not satisfied by build success. Verify the real hosted behavior in the future, not by claiming source scan proves network/cookie/payment absence.

### Required tests for a *future implementation*, not executed here

1. **Authorization:** 132 supplier references, missing/mismatched/expired evidence, denied/withdrawn variant or market, unapproved seller/price/rights and stale EN/RO text cannot create buyable listings or checkout sessions; no accidental auto-promotion from merge.
2. **Catalog, stock and tax:** price/currency in minor units, rounding, VAT/market switching, shipping/dangerous-goods exclusions, oversell races, last-item reservations, expiry, backorders and accessible EN/RO terms; all amounts server-authoritative.
3. **Payments:** PSP sandbox approval/decline/3DS/cancel/refund/partial refund/chargeback, failure and retry; signed webhooks and invalid-signature/replay/duplicate/out-of-order delivery; redirect phishing/open redirect guards; no real charge in CI.
4. **Order and operations:** status-transition properties, immutable order audit, idempotent fulfillment, refund settlement matching, recoverable provider outages, backup + restore drills, on-call alerts, seller emergency kill switch and rollback preserving valid orders.
5. **Security/privacy/accessibility:** least privilege and MFA, penetration/abuse testing, PCI scope assessment, secret exposure and PII/log scans, data subject requests and retention, cookie/transfer assessment, WCAG 2.2 AA and physical-device EN/RO checkout review.
6. **Production admission:** exact merchant account/market and product authorizations, independent legal/rights/payment/finance/QA signatures, explicit separate commerce GO, live-domain/header/network checks, transaction reconciliation and rollback rehearsal.

## 7. Outcome, consequences and follow-up scope

**Accepted only as a proposal for review, not as an authorized platform selection.** The existing static Astro architecture and all publication safeguards remain unchanged. The principal tradeoff is postponing revenue functionality until the business can truthfully operate it, in exchange for preserving user trust, rights boundaries, privacy and reversible architecture. Vendor lock-in vs self-operations cost is intentionally undecided pending evidence.

A future implementation epic must be **created only after** the #59 genuine-product flow and #60/#71 authorized site release prerequisite exist and an accountable business owner approves a dated, verified requirements package. Scope that epic into independently reviewable issues for: seller/market/terms, product-to-offer approval bridge, vendor selection and provider onboarding, inventory/pricing/tax, hosted checkout and signed events, order/fulfillment/refunds, privacy/security/observability, staging/CI and signed commercial launch. This issue neither creates nor implements that epic.

**Open blocking decisions:** seller **TBD**, markets **TBD**, laws/tax **TBD**, product rights **TBD**, genuine products **none**, logistics **TBD**, payments **TBD**, provider **not selected**, legal/tax/rights/QA owners **TBD**, commercial approval **not granted**, release date **TBD**.

## References (reviewed as research sources, not BODICH approvals)

- [Genuine product evidence](../catalog/genuine-product-evidence.md) and [internal product registry](../catalog/internal-product-registry.md)
- [Informational release decision](../qa/issue-71-release-decision.md), [legal sign-off pending](../qa/issue-67-legal-signoff.md), [Cloudflare Pages static release runbook](../deployment/cloudflare-pages.md)
- [Shopify headless](https://shopify.dev/docs/storefronts/headless/overview), [Shopify hosted checkout handoff](https://shopify.dev/docs/storefronts/headless/building-with-the-storefront-api/cart/manage)
- [Medusa architecture](https://docs.medusajs.com/learn/fundamentals/modules/commerce-modules), [Medusa payment module](https://docs.medusajs.com/resources/commerce-modules/payment)
- [WooCommerce gateway API](https://developer.woocommerce.com/docs/features/payments/payment-gateway-api/)
- [Stripe Checkout](https://stripe.com/payments/checkout), [Stripe PCI overview](https://stripe.com/guides/pci-compliance)

Vendor/API documentation and product availability can change; re-verify against the merchant's actual plan, contractual scope and jurisdiction before selection. These links are for evidence gathering, **not** approval to create an account, transact or deploy.
