/**
 * Format a number with K/M/B abbreviations
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with abbreviation
 *
 * Examples:
 * - 1234 -> "1.23K"
 * - 1234567 -> "1.23M"
 * - 1234567890 -> "1.23B"
 * - 123 -> "123"
 */
export function formatWithAbbreviation(value: number, decimals: number = 2): string {
  if (value === 0) return '0';

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  // Helper to remove trailing zeros
  const removeTrailingZeros = (num: string): string => {
    return num.replace(/\.?0+$/, '');
  };

  if (absValue >= 1_000_000_000) {
    // Billions
    return `${sign}${removeTrailingZeros((absValue / 1_000_000_000).toFixed(decimals))}B`;
  } else if (absValue >= 1_000_000) {
    // Millions
    return `${sign}${removeTrailingZeros((absValue / 1_000_000).toFixed(decimals))}M`;
  } else if (absValue >= 1_000) {
    // Thousands
    return `${sign}${removeTrailingZeros((absValue / 1_000).toFixed(decimals))}K`;
  } else {
    // Less than 1000, show up to decimals places
    return `${sign}${removeTrailingZeros(absValue.toFixed(decimals))}`;
  }
}

/**
 * Format a USD amount with $ prefix and K/M/B abbreviations
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "$1.23M"
 */
export function formatUSD(value: number, decimals: number = 2): string {
  return `$${formatWithAbbreviation(value, decimals)}`;
}

/**
 * Format a SOL amount with abbreviations
 * @param value - The numeric value to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "1.23M SOL"
 */
export function formatSOL(value: number, decimals: number = 2): string {
  return `${formatWithAbbreviation(value, decimals)} SOL`;
}
