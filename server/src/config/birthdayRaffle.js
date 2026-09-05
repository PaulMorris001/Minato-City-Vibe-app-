/**
 * Legacy Birthday Raffle deadline.
 *
 * Campaign windows now live in the `raffleCampaign` collection and are managed
 * from the admin dashboard (see raffleCampaign.service.js). This constant is
 * kept only as:
 *   - the seed value for the first campaign (scripts/seedRaffleCampaign.mjs), and
 *   - the synthetic default the raffle controllers fall back to before that
 *     script has run.
 * Once a campaign row exists, changing this value has no effect.
 */
export const RAFFLE_CAMPAIGN_END = new Date("2026-09-30T23:59:59.999Z");
