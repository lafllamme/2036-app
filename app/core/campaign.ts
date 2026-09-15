const CAMPAIGN_START_YEAR = 2026
const CAMPAIGN_END_YEAR = 2036
export const CAMPAIGN_LAST_MONTH = (CAMPAIGN_END_YEAR - CAMPAIGN_START_YEAR + 1) * 12 - 1

export function isCampaignComplete(month: number): boolean {
  return month >= CAMPAIGN_LAST_MONTH
}
