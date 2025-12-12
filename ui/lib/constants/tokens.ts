/**
 * Token constants
 *
 * Note: Only SOL has a fixed decimal count (9). All other token decimals
 * should be fetched dynamically from the token context or API response.
 */

/** SOL always has 9 decimals */
export const SOL_DECIMALS = 9;

/** Multiplier for converting SOL to lamports */
export const SOL_MULTIPLIER = 1e9;

export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
} as const;
