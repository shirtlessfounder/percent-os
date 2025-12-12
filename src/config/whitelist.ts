/**
 * Whitelist configuration for multi-token decision markets
 *
 * This file re-exports pool configuration from the consolidated pools.ts
 * and provides helper functions for authorization checks.
 */

import {
  POOL_CONFIG,
  POOL_WHITELIST as _POOL_WHITELIST,
  POOL_METADATA as _POOL_METADATA,
  PoolMetadata,
} from './pools';

// Re-export for backward compatibility
export const POOL_WHITELIST = _POOL_WHITELIST;
export const POOL_METADATA = _POOL_METADATA;
export type { PoolMetadata };

/**
 * Get all pool addresses that a wallet is authorized to use
 * @param walletAddress - The connected wallet's public key
 * @returns Array of pool addresses the wallet can create DMs for
 */
export function getPoolsForWallet(walletAddress: string): string[] {
  const authorizedPools: string[] = [];

  for (const [poolAddress, authorizedWallets] of Object.entries(POOL_CONFIG.whitelist)) {
    if (authorizedWallets.includes(walletAddress)) {
      authorizedPools.push(poolAddress);
    }
  }

  return authorizedPools;
}

/**
 * Check if a wallet is authorized for a specific pool
 * @param walletAddress - The connected wallet's public key
 * @param poolAddress - The DAMM pool address to check
 * @returns true if wallet is authorized for the pool
 */
export function isWalletAuthorizedForPool(walletAddress: string, poolAddress: string): boolean {
  const authorizedWallets = POOL_CONFIG.whitelist[poolAddress];
  if (!authorizedWallets) {
    return false;
  }
  return authorizedWallets.includes(walletAddress);
}

/**
 * Check if a wallet is whitelisted for any pool
 * @param walletAddress - The connected wallet's public key
 * @returns true if wallet is authorized for at least one pool
 */
export function isWalletWhitelisted(walletAddress: string): boolean {
  return getPoolsForWallet(walletAddress).length > 0;
}

/**
 * Get pool metadata by name/slug (case-insensitive)
 * @param name - The pool name/slug (e.g., 'zc', 'surf')
 * @returns Pool metadata or null if not found
 */
export function getPoolByName(name: string): PoolMetadata | null {
  const lowerName = name.toLowerCase();
  const pool = Object.values(POOL_CONFIG.metadata).find(
    p => p.ticker.toLowerCase() === lowerName
  );
  return pool || null;
}
