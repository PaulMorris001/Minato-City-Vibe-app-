export type PartnerStatus = "none" | "pending" | "approved" | "rejected";

export const MOCK_PARTNER = {
  // Flip this while building: "none" | "pending" | "approved"
  status: "approved" as PartnerStatus,
  appliedAt: null as string | null,

  referralCode: "ADA2026",
  referralLink: "https://ourcityvibe.com/join?ref=ADA2026",

  organizersReferred: 3,
  activeOrganizers: 2,
  feesGeneratedThisMonth: 1250,
  commissionThisMonth: 125,
  commissionPending: 125,
  commissionPaidLifetime: 340,
  nextPayoutDate: "2026-10-01",

  windows: [
    {
      id: "1",
      organizerName: "Chioma Events",
      startDate: "2026-08-12",
      endDate: "2027-08-12",
      status: "open" as const,
      feesLifetime: 4200,
      commissionLifetime: 420,
    },
    {
      id: "2",
      organizerName: "Lagos Nights Co",
      startDate: "2026-09-01",
      endDate: "2027-09-01",
      status: "open" as const,
      feesLifetime: 800,
      commissionLifetime: 80,
    },
  ],
};

/** Single entry helper — use from Home + Profile */
export function getPartnerRoute(status: PartnerStatus = MOCK_PARTNER.status): string {
  switch (status) {
    case "approved":
      return "/partner/dashboard";
    case "pending":
      return "/partner/pending";
    case "rejected":
      return "/partner/apply"; // re-apply
    default:
      return "/partner/apply";
  }
}