/**
 * Fetches the current spot price from a Meteora CP-AMM pool
 * @param poolAddress - The Meteora pool address
 * @returns Price in quote token per base token (SOL per ZC)
 */
export async function fetchPoolPrice(poolAddress: string): Promise<number> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const response = await fetch(`${API_BASE_URL}/api/pools/${poolAddress}/price`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch pool price' }));
    throw new Error(error.message || 'Failed to fetch pool price');
  }

  const data = await response.json();
  return data.price; // SOL per ZC
}

/**
 * Calculates AMM initialization amounts for a fixed SOL liquidity
 * @param spotPrice - Current spot price (SOL per ZC)
 * @param fixedSolAmount - Fixed amount of SOL liquidity (default: 25)
 * @param baseDecimals - Base token decimals (default: 6 for ZC)
 * @param quoteDecimals - Quote token decimals (default: 9 for SOL)
 * @returns Object with initialBaseAmount and initialQuoteAmount as strings
 */
export function calculateAMMAmounts(
  spotPrice: number,
  fixedSolAmount: number = 25,
  baseDecimals: number = 6,
  quoteDecimals: number = 9
): { initialBaseAmount: string; initialQuoteAmount: string } {
  // Calculate base token amount needed for fixed SOL liquidity
  // Price = SOL / ZC, therefore: ZC = SOL / Price
  const baseAmount = fixedSolAmount / spotPrice;

  // Convert to raw units (smallest units)
  const initialBaseAmount = Math.floor(baseAmount * Math.pow(10, baseDecimals)).toString();
  const initialQuoteAmount = Math.floor(fixedSolAmount * Math.pow(10, quoteDecimals)).toString();

  return {
    initialBaseAmount,
    initialQuoteAmount
  };
}
