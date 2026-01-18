/*
 * Copyright (C) 2026 Spice Finance Inc.
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
import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { getConnection } from '@/lib/programs/utils';

interface DexScreenerPair {
  baseToken: {
    address: string;
    symbol: string;
  };
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  liquidity?: {
    usd: number;
  };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

interface ProjectMarketCap {
  mint: string;
  mcapUsd: number | null;
  fdvUsd: number | null;
  priceUsd: number | null;
  supply: number | null;
}

interface UseProjectMarketCapsResult {
  data: Map<string, ProjectMarketCap>;
  loading: boolean;
  error: string | null;
  combinedMcap: number;
}

// Cache for results (5 minute TTL)
const mcapCache = new Map<string, { data: ProjectMarketCap; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch market cap data for multiple token mints.
 * Uses on-chain supply from getMint + price from DexScreener to calculate accurate mcap.
 */
export function useProjectMarketCaps(mints: string[]): UseProjectMarketCapsResult {
  const [data, setData] = useState<Map<string, ProjectMarketCap>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [combinedMcap, setCombinedMcap] = useState(0);

  const connection = useMemo(() => getConnection(), []);

  // Track previous mints to avoid refetching
  const prevMintsRef = useRef<string>('');

  useEffect(() => {
    // Deduplicate and filter empty mints
    const uniqueMints = [...new Set(mints.filter(m => m && m.length > 0))];

    if (uniqueMints.length === 0) {
      setData(new Map());
      setCombinedMcap(0);
      setLoading(false);
      prevMintsRef.current = ''; // Reset so next non-empty call triggers fetch
      return;
    }

    // Check if mints have changed
    const mintsKey = uniqueMints.sort().join(',');
    if (mintsKey === prevMintsRef.current) {
      // Even if mints haven't changed, recalculate from cache
      const now = Date.now();
      const results = new Map<string, ProjectMarketCap>();
      let allCached = true;

      for (const mint of uniqueMints) {
        const cached = mcapCache.get(mint);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          results.set(mint, cached.data);
        } else {
          allCached = false;
          break;
        }
      }

      if (allCached && results.size > 0) {
        let total = 0;
        for (const [, mcap] of results) {
          if (mcap.mcapUsd !== null) {
            total += mcap.mcapUsd;
          }
        }
        setData(results);
        setCombinedMcap(total);
      }
      return;
    }
    prevMintsRef.current = mintsKey;

    const fetchMarketCaps = async () => {
      setLoading(true);
      setError(null);

      const now = Date.now();
      const results = new Map<string, ProjectMarketCap>();
      const mintsToFetch: string[] = [];

      // Check cache first
      for (const mint of uniqueMints) {
        const cached = mcapCache.get(mint);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          results.set(mint, cached.data);
        } else {
          mintsToFetch.push(mint);
        }
      }

      // Fetch uncached mints
      if (mintsToFetch.length > 0) {
        try {
          // Fetch supplies from chain and prices from DexScreener in parallel
          const [supplies, prices] = await Promise.all([
            fetchSupplies(connection, mintsToFetch),
            fetchPricesFromDexScreener(mintsToFetch),
          ]);

          console.log('[useProjectMarketCaps] Supplies from chain:', Object.fromEntries(supplies));
          console.log('[useProjectMarketCaps] Prices from DexScreener:', Object.fromEntries(prices));

          // Calculate mcap for each token
          for (const mint of mintsToFetch) {
            const supplyData = supplies.get(mint);
            const priceUsd = prices.get(mint);

            let mcapUsd: number | null = null;
            if (supplyData && priceUsd !== null && priceUsd !== undefined) {
              // supply is already adjusted for decimals
              mcapUsd = priceUsd * supplyData.supply;
            }

            const mcapData: ProjectMarketCap = {
              mint,
              mcapUsd,
              fdvUsd: mcapUsd, // FDV = mcap when using total supply
              priceUsd: priceUsd ?? null,
              supply: supplyData?.supply ?? null,
            };

            console.log('[useProjectMarketCaps] Calculated mcap:', mint, mcapData);

            results.set(mint, mcapData);
            mcapCache.set(mint, { data: mcapData, timestamp: now });
          }
        } catch (err) {
          console.error('[useProjectMarketCaps] Error:', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch market cap data');
        }
      }

      // Calculate combined market cap
      let total = 0;
      for (const [, mcap] of results) {
        if (mcap.mcapUsd !== null) {
          total += mcap.mcapUsd;
        }
      }

      setData(results);
      setCombinedMcap(total);
      setLoading(false);
    };

    fetchMarketCaps();
  }, [mints, connection]);

  return { data, loading, error, combinedMcap };
}

/**
 * Fetch token supplies from chain using getMint
 */
async function fetchSupplies(
  connection: ReturnType<typeof getConnection>,
  mints: string[]
): Promise<Map<string, { supply: number; decimals: number }>> {
  const results = new Map<string, { supply: number; decimals: number }>();

  await Promise.all(
    mints.map(async (mint) => {
      try {
        const mintInfo = await getMint(connection, new PublicKey(mint));
        const decimals = mintInfo.decimals;
        const supply = Number(mintInfo.supply) / Math.pow(10, decimals);
        results.set(mint, { supply, decimals });
      } catch (err) {
        console.error(`[fetchSupplies] Error for ${mint}:`, err);
      }
    })
  );

  return results;
}

/**
 * Fetch prices from DexScreener API
 */
async function fetchPricesFromDexScreener(mints: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  try {
    // DexScreener allows batch requests with comma-separated addresses
    const batchSize = 30;
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      const url = `https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }

      const json: DexScreenerResponse = await response.json();

      if (json.pairs && json.pairs.length > 0) {
        // Group pairs by base token address
        const pairsByToken = new Map<string, DexScreenerPair[]>();
        for (const pair of json.pairs) {
          const addr = pair.baseToken.address;
          if (!pairsByToken.has(addr)) {
            pairsByToken.set(addr, []);
          }
          pairsByToken.get(addr)!.push(pair);
        }

        // Log all pairs for debugging
        for (const [addr, pairs] of pairsByToken) {
          console.log(`[fetchPricesFromDexScreener] Token ${addr} has ${pairs.length} pairs:`);
          pairs.forEach((p, idx) => {
            console.log(`  [${idx}] ${p.baseToken.symbol}: price=${p.priceUsd}, liq=${p.liquidity?.usd}`);
          });
        }

        // For each token, pick the pair with highest liquidity for price
        for (const mint of batch) {
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
          const bestPair = pairs.reduce<DexScreenerPair | null>((best, pair) => {
            const currentLiq = pair.liquidity?.usd || 0;
            const bestLiq = best?.liquidity?.usd || 0;
            return currentLiq > bestLiq ? pair : best;
          }, null);

          if (bestPair?.priceUsd) {
            results.set(mint, parseFloat(bestPair.priceUsd));
          }
        }
      }
    }
  } catch (err) {
    console.error('[fetchPricesFromDexScreener] Error:', err);
  }

  return results;
}
