export const BRAND = "C.A.T.H.Y.";
export const BRAND_DIVISION = "C.A.T.H.Y. — Compliance, Asset Tracking & Heavy Yards";
export const COPYRIGHT_LINE =
  "Copyright © 2026 C.A.T.H.Y. All Rights Reserved. Proprietary and Confidential.";
export const TERMS_VERSION = "2026-01";
export const SUPER_ADMIN_EMAIL = "wi1dcrd79@gmail.com";
export const SUPPORT_EMAIL = "wi1dcrd79@gmail.com";

export interface TermsSection {
  heading: string;
  body: string[];
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: "1. Acceptance of Terms",
    body: [
      `By creating an account or accessing ${BRAND_DIVISION} ("the Platform"), you agree to these Terms of Service on behalf of yourself and the company you represent. If you do not agree, do not create an account and do not use the Platform.`,
    ],
  },
  {
    heading: "2. Licensed Use",
    body: [
      "You receive a limited, non-exclusive, non-transferable, revocable right to use the Platform for your own internal compliance, inspection, personnel certification, and asset tracking operations for the duration of your paid or trial subscription.",
    ],
  },
  {
    heading: "3. Restricted Rights and Prohibited Conduct",
    body: [
      "You may not scrape, crawl, harvest, bulk-export, or use automated agents to extract data, page structure, or content from the Platform except through features expressly provided to you.",
      "You may not decompile, disassemble, reverse engineer, or otherwise attempt to derive the source code, database schema, algorithms, or compliance calculation logic of the Platform.",
      "You may not copy, imitate, or clone the Platform's system workflows, screen flows, scanning and transfer processes, continuity matrices, or audit binder formats to build a competing or derivative product or service.",
      "You may not resell, sublicense, white-label, or provide access to the Platform to any third party, and you may not share account credentials or circumvent seat, plan, or access limits.",
      "You may not probe, scan, or test the vulnerability of the Platform, or interfere with its operation or security controls.",
    ],
  },
  {
    heading: "4. Customer Ownership of Raw Records",
    body: [
      "You retain all right, title, and interest in the raw records you submit to the Platform, including asset registers, serial numbers, inspection results, photographs, personnel files, and certification data ('Customer Data').",
      `${BRAND} claims no ownership of Customer Data and processes it solely to provide the Platform to you. You may export your Customer Data at any time while your subscription is active.`,
      `${BRAND} retains all right, title, and interest in the Platform itself, including its software, interfaces, workflows, templates, and any aggregated or de-identified statistics derived from usage.`,
    ],
  },
  {
    heading: "5. Compliance Responsibility and Third-Party Audits",
    body: [
      "The Platform is a record-keeping and scheduling tool. It does not certify equipment or personnel, does not perform inspections, and does not constitute legal, safety, or regulatory advice.",
      "You remain solely responsible for the accuracy, completeness, and timeliness of your records and for meeting all applicable OSHA, ASME, AWS, API, NCCCO, state, and client requirements.",
    ],
  },
  {
    heading: "6. Limitation of Liability",
    body: [
      `${BRAND} is not liable for any finding, citation, penalty, fine, delay, stop-work order, contract loss, or other outcome arising from any third-party regulatory, OSHA, insurer, general-contractor, or client audit, whether or not the Platform's records were relied upon.`,
      `To the maximum extent permitted by law, ${BRAND}'s total aggregate liability arising out of or related to the Platform is limited to the amounts you paid in the twelve (12) months preceding the claim, and ${BRAND} is not liable for indirect, incidental, consequential, special, exemplary, or punitive damages, or for lost profits or lost business.`,
      'The Platform is provided "as is" and "as available," without warranties of any kind, express or implied.',
    ],
  },
  {
    heading: "7. Suspension and Termination",
    body: [
      `${BRAND} may suspend or terminate access immediately for breach of these Terms, including any prohibited scraping, reverse engineering, or cloning activity. On termination, your licensed right to use the Platform ends; you may request an export of your Customer Data within thirty (30) days.`,
    ],
  },
  {
    heading: "8. Pricing and Subscription Billing",
    body: [
      "Field Yard Pro — $279 per month: unlimited equipment and rigging tracking, 5 operational seats, automated continuous audit binders, and hardware barcode scanner support.",
      "Enterprise Contractor — $699 per month: everything in Field Yard Pro plus multi-yard / multi-site switching, unlimited crew seats, the full personnel continuity engine, and priority audit binder export.",
      "A Free tier is available at no charge, limited to 3 tracked assets and 1 seat.",
      "All paid plans are billed monthly in advance in U.S. dollars and renew automatically each month until canceled. Prices are exclusive of any sales tax or VAT, which is calculated and collected at checkout where applicable.",
      "Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for all our orders. Paddle provides all customer service inquiries and handles returns.",
    ],
  },
  {
    heading: "9. Cancellation, Refunds and Read-Only Grace Period",
    body: [
      "You may cancel at any time from your account settings or through the Paddle customer portal. Cancellation stops future renewals; your plan stays active through the end of the billing period you already paid for.",
      "We offer a 30-day money-back guarantee. If you are not satisfied, request a full refund within 30 days of your order date. Refunds are processed by Paddle — visit paddle.net or contact us at " +
        SUPPORT_EMAIL +
        ". Where a plan is canceled or downgraded mid-term, any refund due is handled on a prorated basis for the unused portion of the paid period.",
      "If a payment fails or a subscription lapses, your account enters a 30-day Read-Only Compliance Grace Period. Your assets, location history, personnel records and printable audit binders remain fully viewable and exportable; only new assets beyond the free limit and new yard transfers are paused until payment is updated. This exists so contractors are never locked out of records during an active OSHA, ASME or AWS audit.",
    ],
  },
  {
    heading: "10. Support and Operator Contact",
    body: [
      `Operational and billing support for the Platform is provided by ${BRAND} at ${SUPPORT_EMAIL}. We aim to respond to all support requests within one business day. Payment, invoice and refund inquiries may also be raised directly with Paddle, the Merchant of Record, at paddle.net.`,
    ],
  },
  {
    heading: "11. Confidentiality and Governing Terms",
    body: [
      "The Platform and its non-public features are the confidential and proprietary information of C.A.T.H.Y. These Terms, together with any executed order form, are the entire agreement between the parties and supersede prior discussions.",
      COPYRIGHT_LINE,
    ],
  },
];

export const PRIVACY_SECTIONS: TermsSection[] = [
  {
    heading: "What we collect",
    body: [
      `${BRAND_DIVISION} collects only what is needed to run compliance record-keeping: your work email and account role, your company name and subscription state, and the operational records your crew enters — assets, serial numbers, locations and yard transfers, inspections and photos, personnel records and certifications.`,
      "We also record basic technical data such as device type, app version and error diagnostics so the field app stays reliable in the yard.",
    ],
  },
  {
    heading: "How we use it",
    body: [
      "Your data is used solely to provide the Platform to you: showing your records, calculating compliance status, generating audit binders, syncing offline yard moves and supporting your account. We do not sell personal data and we do not use your records for advertising.",
    ],
  },
  {
    heading: "Who we share it with",
    body: [
      "Processing partners only: our cloud hosting and database provider, and Paddle.com as Merchant of Record for payments. Paddle receives billing contact and transaction data; card details are handled by Paddle and never stored by us.",
      "We disclose data otherwise only when legally required, or when you ask us to.",
    ],
  },
  {
    heading: "Security and retention",
    body: [
      "Access is restricted per company and per user through row-level database security. Inspection photos are stored in a private bucket accessible only to authenticated members of your company. Records are retained for the life of your account; on termination you may request an export within thirty (30) days, after which data may be deleted.",
    ],
  },
  {
    heading: "Your rights and contact",
    body: [
      `You may request access to, correction of, export of, or deletion of your personal data at any time by writing to ${SUPPORT_EMAIL}. Account deletion removes your personal profile data; shared company compliance records may be retained by the company that owns them.`,
      "Children under 16 are not permitted to use the Platform.",
    ],
  },
];

export interface PlanDisclosure {
  name: string;
  price: string;
  features: string[];
}

export const PLAN_DISCLOSURES: PlanDisclosure[] = [
  {
    name: "Field Yard Pro",
    price: "$279 / month",
    features: [
      "Unlimited equipment & rigging tracking",
      "5 operational seats",
      "Automated continuous audit binders",
      "Hardware barcode scanner support",
    ],
  },
  {
    name: "Enterprise Contractor",
    price: "$699 / month",
    features: [
      "Multi-yard / multi-site switching",
      "Unlimited crew seats",
      "Full personnel continuity engine",
      "Priority audit binder export",
    ],
  },
];
