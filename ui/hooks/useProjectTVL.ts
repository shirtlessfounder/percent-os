/*
 * Copyright (C) 2025 Spice Finance Inc.
 *
 * This file is part of Z Combinator.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection } from '@/lib/programs/utils';

// USDC mint on mainnet
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

// Treasury configuration input
export interface TreasuryConfig {
  treasuryVault: string;
  tokenMint: string;
}

interface ProjectTVL {
  treasuryVault: string;
  solBalance: number;
  usdcBalance: number;
  nativeTokenBalance: number;
  nativeTokenValueUsd: number;
  tvlUsd: number;
}

interface UseProjectTVLResult {
  data: Map<string, ProjectTVL>;
  loading: boolean;
  error: string | null;
  combinedTvlUsd: number;
}

// Cache for results (5 minute TTL)
const tvlCache = new Map<string, { data: ProjectTVL; timestamp: number }>();
const solPriceCache: { price: number | null; timestamp: number } = { price: null, timestamp: 0 };
const tokenPriceCache = new Map<string, { price: number | null; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Native SOL mint for DexScreener lookup
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Fetch TVL data for project treasury vaults.
 * Fetches SOL, USDC, and native token balances, converts to USD.
 */
export function useProjectTVL(treasuryConfigs: TreasuryConfig[]): UseProjectTVLResult {
  const [data, setData] = useState<Map<string, ProjectTVL>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [combinedTvlUsd, setCombinedTvlUsd] = useState(0);

  const connection = useMemo(() => getConnection(), []);

  // Track previous configs to avoid refetching
  const prevConfigsRef = useRef<string>('');

  useEffect(() => {
    // Filter valid configs
    const validConfigs = treasuryConfigs.filter(c => c.treasuryVault && c.treasuryVault.length > 0);

    if (validConfigs.length === 0) {
      setData(new Map());
      setCombinedTvlUsd(0);
      setLoading(false);
      prevConfigsRef.current = ''; // Reset so next non-empty call triggers fetch
      return;
    }

    // Check if configs have changed
    const configsKey = validConfigs.map(c => `${c.treasuryVault}:${c.tokenMint}`).sort().join(',');
    if (configsKey === prevConfigsRef.current) {
      // Even if configs haven't changed, recalculate from cache
      const now = Date.now();
      const results = new Map<string, ProjectTVL>();
      let allCached = true;

      for (const config of validConfigs) {
        const cached = tvlCache.get(config.treasuryVault);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          results.set(config.treasuryVault, cached.data);
        } else {
          allCached = false;
          break;
        }
      }

      if (allCached && results.size > 0) {
        let total = 0;
        for (const [, tvl] of results) {
          total += tvl.tvlUsd;
        }
        setData(results);
        setCombinedTvlUsd(total);
      }
      return;
    }
    prevConfigsRef.current = configsKey;

    const fetchTVL = async () => {
      setLoading(true);
      setError(null);

      const now = Date.now();
      const results = new Map<string, ProjectTVL>();
      const configsToFetch: TreasuryConfig[] = [];

      // Check cache first
      for (const config of validConfigs) {
        const cached = tvlCache.get(config.treasuryVault);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          results.set(config.treasuryVault, cached.data);
        } else {
          configsToFetch.push(config);
        }
      }

      // Fetch uncached vaults
      if (configsToFetch.length > 0) {
        const vaultsToFetch = configsToFetch.map(c => c.treasuryVault);
        const tokenMints = configsToFetch.map(c => c.tokenMint);

        try {
          // Fetch SOL price, SOL balances, USDC balances, native token balances and prices in parallel
          const [solPrice, solBalances, usdcBalances, nativeTokenBalances, nativeTokenPrices] = await Promise.all([
            fetchSolPrice(),
            fetchSolBalances(connection, vaultsToFetch),
            fetchUsdcBalances(connection, vaultsToFetch),
            fetchNativeTokenBalances(connection, configsToFetch),
            fetchTokenPrices(tokenMints),
          ]);

          console.log('[useProjectTVL] SOL price:', solPrice);
          console.log('[useProjectTVL] SOL balances:', Object.fromEntries(solBalances));
          console.log('[useProjectTVL] USDC balances:', Object.fromEntries(usdcBalances));
          console.log('[useProjectTVL] Native token balances:', Object.fromEntries(nativeTokenBalances));
          console.log('[useProjectTVL] Native token prices:', Object.fromEntries(nativeTokenPrices));

          // Calculate TVL for each vault
          for (const config of configsToFetch) {
            const vault = config.treasuryVault;
            const solBalance = solBalances.get(vault) ?? 0;
            const usdcBalance = usdcBalances.get(vault) ?? 0;
            const nativeTokenBalance = nativeTokenBalances.get(vault) ?? 0;
            const nativeTokenPrice = nativeTokenPrices.get(config.tokenMint) ?? 0;

            // TVL = (SOL balance × SOL price) + USDC balance + (native token balance × price)
            const solValueUsd = solPrice !== null ? solBalance * solPrice : 0;
            const nativeTokenValueUsd = nativeTokenBalance * nativeTokenPrice;
            const tvlUsd = solValueUsd + usdcBalance + nativeTokenValueUsd;

            const tvlData: ProjectTVL = {
              treasuryVault: vault,
              solBalance,
              usdcBalance,
              nativeTokenBalance,
              nativeTokenValueUsd,
              tvlUsd,
            };

            console.log('[useProjectTVL] Calculated TVL:', vault, tvlData);

            results.set(vault, tvlData);
            tvlCache.set(vault, { data: tvlData, timestamp: now });
          }
        } catch (err) {
          console.error('[useProjectTVL] Error:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch TVL data');
        }
      }

      // Calculate combined TVL
      let total = 0;
      for (const [, tvl] of results) {
        total += tvl.tvlUsd;
      }

      setData(results);
      setCombinedTvlUsd(total);
      setLoading(false);
    };

    fetchTVL();
  }, [treasuryConfigs, connection]);

  return { data, loading, error, combinedTvlUsd };
}

/**
 * Fetch SOL price from DexScreener API with caching
 */
async function fetchSolPrice(): Promise<number | null> {
  const now = Date.now();

  // Check cache
  if (solPriceCache.price !== null && now - solPriceCache.timestamp < CACHE_TTL_MS) {
    return solPriceCache.price;
  }

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${NATIVE_SOL_MINT}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }

    const json = await response.json();

    if (json.pairs && json.pairs.length > 0) {
      // Pick pair with highest liquidity for most accurate price
      const bestPair = json.pairs.reduce((best: any, pair: any) => {
        const currentLiq = pair.liquidity?.usd || 0;
        const bestLiq = best?.liquidity?.usd || 0;
        return currentLiq > bestLiq ? pair : best;
      }, null);

      if (bestPair?.priceUsd) {
        const price = parseFloat(bestPair.priceUsd);
        solPriceCache.price = price;
        solPriceCache.timestamp = now;
        return price;
      }
    }

    return null;
  } catch (err) {
    console.error('[fetchSolPrice] Error:', err);
    return null;
  }
}

/**
 * Fetch SOL balances from chain using getBalance
 */
async function fetchSolBalances(
  connection: ReturnType<typeof getConnection>,
  vaults: string[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  await Promise.all(
    vaults.map(async (vault) => {
      try {
        const balance = await connection.getBalance(new PublicKey(vault));
        // Convert lamports to SOL
        const solBalance = balance / LAMPORTS_PER_SOL;
        results.set(vault, solBalance);
      } catch (err) {
        console.error(`[fetchSolBalances] Error for ${vault}:`, err);
        results.set(vault, 0);
      }
    })
  );

  return results;
}

/**
 * Fetch USDC balances from chain using getTokenAccountsByOwner
 * This works for both standard wallets and Squads multisigs
 */
async function fetchUsdcBalances(
  connection: ReturnType<typeof getConnection>,
  vaults: string[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  await Promise.all(
    vaults.map(async (vault) => {
      try {
        const vaultPubkey = new PublicKey(vault);

        // Get all token accounts for USDC owned by this vault
        const tokenAccounts = await connection.getTokenAccountsByOwner(vaultPubkey, {
          mint: USDC_MINT,
        });

        let totalBalance = 0;
        for (const { account } of tokenAccounts.value) {
          // Parse the account data to get the balance
          const data = account.data;
          // Token account data: first 64 bytes are mint (32) + owner (32), then amount (8 bytes, little-endian u64)
          const amount = data.readBigUInt64LE(64);
          totalBalance += Number(amount) / Math.pow(10, USDC_DECIMALS);
        }

        results.set(vault, totalBalance);
      } catch (err) {
        console.error(`[fetchUsdcBalances] Error for ${vault}:`, err);
        results.set(vault, 0);
      }
    })
  );

  return results;
}

/**
 * Fetch native token balances from chain for each treasury config
 * Uses getTokenAccountsByOwner to support Squads multisigs
 */
async function fetchNativeTokenBalances(
  connection: ReturnType<typeof getConnection>,
  configs: TreasuryConfig[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  await Promise.all(
    configs.map(async (config) => {
      try {
        const vaultPubkey = new PublicKey(config.treasuryVault);
        const tokenMintPubkey = new PublicKey(config.tokenMint);

        // Get token decimals from mint first
        const { getMint } = await import('@solana/spl-token');
        const mintInfo = await getMint(connection, tokenMintPubkey);
        const decimals = mintInfo.decimals;

        // Get all token accounts for the native token owned by this vault
        const tokenAccounts = await connection.getTokenAccountsByOwner(vaultPubkey, {
          mint: tokenMintPubkey,
        });

        let totalBalance = 0;
        for (const { account } of tokenAccounts.value) {
          // Parse the account data to get the balance
          const data = account.data;
          // Token account data: first 64 bytes are mint (32) + owner (32), then amount (8 bytes, little-endian u64)
          const amount = data.readBigUInt64LE(64);
          totalBalance += Number(amount) / Math.pow(10, decimals);
        }

        results.set(config.treasuryVault, totalBalance);
      } catch (err) {
        console.error(`[fetchNativeTokenBalances] Error for ${config.treasuryVault}:`, err);
        results.set(config.treasuryVault, 0);
      }
    })
  );

  return results;
}

/**
 * Fetch token prices from DexScreener API with caching
 */
async function fetchTokenPrices(mints: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  const now = Date.now();
  const mintsToFetch: string[] = [];

  // Check cache first
  for (const mint of mints) {
    const cached = tokenPriceCache.get(mint);
    if (cached && now - cached.timestamp < CACHE_TTL_MS && cached.price !== null) {
      results.set(mint, cached.price);
    } else {
      mintsToFetch.push(mint);
    }
  }

  if (mintsToFetch.length === 0) {
    return results;
  }

  try {
    // DexScreener allows batch requests with comma-separated addresses
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mintsToFetch.join(',')}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }

    const json = await response.json();

    if (json.pairs && json.pairs.length > 0) {
      // Group pairs by base token address
      const pairsByToken = new Map<string, any[]>();
      for (const pair of json.pairs) {
        const addr = pair.baseToken.address;
        if (!pairsByToken.has(addr)) {
          pairsByToken.set(addr, []);
        }
        pairsByToken.get(addr)!.push(pair);
      }

      // For each token, pick the pair with highest liquidity for price
      for (const mint of mintsToFetch) {
        let pairs = pairsByToken.get(mint) || [];

        // If no exact match, try case-insensitive
        if (pairs.length === 0) {
          for (const [addr, p] of pairsByToken) {
            if (addr.toLowerCase() === mint.toLowerCase()) {
              pairs = p;
              break;
            }
          }
        }

        // Pick pair with highest liquidity for most accurate price
        const bestPair = pairs.reduce<any | null>((best, pair) => {
          const currentLiq = pair.liquidity?.usd || 0;
          const bestLiq = best?.liquidity?.usd || 0;
          return currentLiq > bestLiq ? pair : best;
        }, null);

        if (bestPair?.priceUsd) {
          const price = parseFloat(bestPair.priceUsd);
          results.set(mint, price);
          tokenPriceCache.set(mint, { price, timestamp: now });
        } else {
          results.set(mint, 0);
          tokenPriceCache.set(mint, { price: 0, timestamp: now });
        }
      }
    }
  } catch (err) {
    console.error('[fetchTokenPrices] Error:', err);
    // Set 0 for all failed mints
    for (const mint of mintsToFetch) {
      results.set(mint, 0);
    }
  }

  return results;
}
