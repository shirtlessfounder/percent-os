/**
 * Token constants
 *
 * Note: Only SOL has a fixed decimal count (9). All other token decimals
 * should be fetched dynamically from the token context or API response.
 */

/** SOL always has 9 decimals */
export const SOL_DECIMALS = 9;

/** Known token mint addresses */
export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

/** Set of stablecoin mint addresses */
export const STABLECOIN_MINTS = new Set([
  TOKEN_MINTS.USDC,
  TOKEN_MINTS.USDT,
]);

/** Map of mint address to token symbol for known tokens */
const MINT_TO_SYMBOL: Record<string, string> = {
  [TOKEN_MINTS.SOL]: 'SOL',
  [TOKEN_MINTS.USDC]: 'USDC',
  [TOKEN_MINTS.USDT]: 'USDT',
};

/** Map of mint address to icon path for known tokens */
const MINT_TO_ICON: Record<string, string> = {
  [TOKEN_MINTS.SOL]: '/solana-logo.jpg',
  [TOKEN_MINTS.USDC]: '/usdc-logo.png',
  [TOKEN_MINTS.USDT]: '/usdt-logo.png',
};

/**
 * Get the symbol for a known token mint address.
 * Returns the truncated address if unknown, or empty string if null.
 */
export function getTokenSymbol(mintAddress: string | null | undefined): string {
  if (!mintAddress) return '';
  return MINT_TO_SYMBOL[mintAddress] || mintAddress.slice(0, 4) + '...';
}

/**
 * Get the icon path for a known token mint address.
 * Returns null if unknown or if mintAddress is null.
 */
export function getTokenIcon(mintAddress: string | null | undefined): string | null {
  if (!mintAddress) return null;
  return MINT_TO_ICON[mintAddress] || null;
}

/**
 * Check if a mint address is native SOL (wrapped SOL).
 * Returns false if mintAddress is null/undefined.
 */
export function isNativeSol(mintAddress: string | null | undefined): boolean {
  if (!mintAddress) return false;
  return mintAddress === TOKEN_MINTS.SOL;
}

/**
 * Check if a mint address is a known stablecoin (USDC, USDT).
 * Returns false if mintAddress is null/undefined.
 */
export function isStablecoin(mintAddress: string | null | undefined): boolean {
  if (!mintAddress) return false;
  return STABLECOIN_MINTS.has(mintAddress);
}

/**
 * Get the recommended number of decimal places to display for a token.
 * Stablecoins (USDC, USDT) show 2 decimals, others show 4.
 */
export function getDisplayDecimals(mintAddress: string | null | undefined): number {
  if (!mintAddress) return 4;
  return isStablecoin(mintAddress) ? 2 : 4;
}
