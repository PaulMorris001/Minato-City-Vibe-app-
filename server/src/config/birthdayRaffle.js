/**
 * Birthday Raffle campaign config — the one place the entry cutoff lives.
 * mobile/app/birthday-raffle/index.tsx mirrors this deadline for its static
 * marketing copy (prizes, rules); this file is what actually gates
 * eligibility, so the two must be kept in sync by hand if the campaign dates
 * change.
 */
export const RAFFLE_CAMPAIGN_END = new Date("2026-09-30T23:59:59.999Z");
