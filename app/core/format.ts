/**
 * German number formatting, shared by the simulation and the interface.
 *
 * The simulation already writes German headlines, so it formats German numbers too — otherwise the
 * ticker prints "13.51 €/m²" next to a rail showing "13,61 €/m²" and the two look like different
 * measurements. Intl is part of ECMA-402 and available in workers, so this stays DOM-free.
 */
export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}
