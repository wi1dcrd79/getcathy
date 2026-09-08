export const BRAND = "C.A.T.H.Y.";
export const BRAND_DIVISION = "C.A.T.H.Y. — Compliance, Asset Tracking & Heavy Yards";
export const COPYRIGHT_LINE =
  "Copyright © 2026 C.A.T.H.Y. All Rights Reserved. Proprietary and Confidential.";
export const TERMS_VERSION = "2026-01";
export const SUPER_ADMIN_EMAIL = "w1dcrd79@gmail.com";

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
    heading: "8. Confidentiality and Governing Terms",
    body: [
      "The Platform, its non-public features, and pricing are the confidential and proprietary information of C.A.T.H.Y. These Terms, together with any executed order form, are the entire agreement between the parties and supersede prior discussions.",
      COPYRIGHT_LINE,
    ],
  },
];
