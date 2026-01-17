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

import { useState, useEffect, useCallback, useRef } from 'react';

// Fee wallet address (from buyback scripts)
const FEE_WALLET = 'FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC';

// ZC mint address
const ZC_MINT = 'GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC';

// Staking vault program ID
const STAKING_VAULT_PROGRAM = '47rZ1jgK7zU6XAgffAfXkDX1JkiiRi4HRPBytossWR12';

// ZC decimals
const ZC_DECIMALS = 6;

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: UseBuybackDataResult;
  timestamp: number;
}

// Simple in-memory cache
const cache: Map<string, CacheEntry> = new Map();

export interface DailyBuyback {
  date: string;      // YYYY-MM-DD
  zcAmount: number;  // ZC tokens bought back
  usdAmount: number; // USD value at time of buyback
}

export interface UseBuybackDataResult {
  dailyData: DailyBuyback[];
  totalZc: number;
  totalUsd: number;
  loading: boolean;
  error: string | null;
}

// Helius Enhanced Transaction types
interface HeliusTokenTransfer {
  fromTokenAccount: string;
  toTokenAccount: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard: string;
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  tokenTransfers?: HeliusTokenTransfer[];
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      userAccount: string;
      tokenAccount: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      mint: string;
    }>;
  }>;
}

/**
 * Fetch transactions from fee wallet using Helius API
 */
async function fetchFeeWalletTransactions(
  startTime: number,
  endTime: number
): Promise<HeliusTransaction[]> {
  const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  if (!heliusApiKey) {
    console.warn('[useBuybackData] NEXT_PUBLIC_HELIUS_API_KEY not configured');
    return [];
  }

  const allTxs: HeliusTransaction[] = [];
  let beforeSignature: string | undefined;
  let keepFetching = true;

  while (keepFetching) {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${FEE_WALLET}/transactions`);
    url.searchParams.set('api-key', heliusApiKey);
    if (beforeSignature) {
      url.searchParams.set('before', beforeSignature);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
    }

    const transactions: HeliusTransaction[] = await response.json();

    if (transactions.length === 0) {
      break;
    }

    for (const tx of transactions) {
      const txTime = tx.timestamp * 1000;

      // Stop if we've gone past the start time
      if (txTime < startTime) {
        keepFetching = false;
        break;
      }

      // Include if within range
      if (txTime <= endTime) {
        allTxs.push(tx);
      }
    }

    // Set cursor for next page
    beforeSignature = transactions[transactions.length - 1].signature;

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return allTxs;
}

/**
 * Detect buyback amounts from transactions
 * Buybacks = ZC burns + ZC transfers to staking vault
 */
function detectBuybacks(transactions: HeliusTransaction[]): Map<string, number> {
  const dailyBuybacks = new Map<string, number>();

  for (const tx of transactions) {
    const date = new Date(tx.timestamp * 1000).toISOString().split('T')[0];
    let zcAmount = 0;

    // Method 1: Check for BURN type transactions with ZC
    if (tx.type === 'BURN' || tx.type === 'TOKEN_BURN') {
      // Look in token transfers or account data for ZC amounts
      if (tx.tokenTransfers) {
        for (const transfer of tx.tokenTransfers) {
          if (transfer.mint === ZC_MINT && transfer.fromUserAccount === FEE_WALLET) {
            zcAmount += transfer.tokenAmount;
          }
        }
      }
    }

    // Method 2: Check for transfers to staking vault
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (
          transfer.mint === ZC_MINT &&
          transfer.fromUserAccount === FEE_WALLET
        ) {
          // Check if this is a transfer to staking vault
          // The staking vault uses program-derived addresses
          // We identify these by checking account data for the staking program
          const isStakingVaultTransfer = tx.accountData?.some(
            acc => acc.account === STAKING_VAULT_PROGRAM
          );

          if (isStakingVaultTransfer) {
            zcAmount += transfer.tokenAmount;
          }
        }
      }
    }

    // Method 3: Check accountData for ZC balance decreases (burns show as negative)
    if (tx.accountData) {
      for (const account of tx.accountData) {
        if (account.account === FEE_WALLET && account.tokenBalanceChanges) {
          for (const change of account.tokenBalanceChanges) {
            if (change.mint === ZC_MINT) {
              const rawAmount = parseFloat(change.rawTokenAmount.tokenAmount);
              // Negative balance change from fee wallet = tokens sent/burned
              if (rawAmount < 0) {
                // Check if this is a burn (no destination) or staking transfer
                const isBurnOrStaking =
                  tx.type === 'BURN' ||
                  tx.type === 'TOKEN_BURN' ||
                  tx.accountData?.some(acc => acc.account === STAKING_VAULT_PROGRAM);

                if (isBurnOrStaking) {
                  zcAmount = Math.max(zcAmount, Math.abs(rawAmount) / Math.pow(10, change.rawTokenAmount.decimals));
                }
              }
            }
          }
        }
      }
    }

    if (zcAmount > 0) {
      dailyBuybacks.set(date, (dailyBuybacks.get(date) || 0) + zcAmount);
    }
  }

  return dailyBuybacks;
}

/**
 * Fetch ZC price from DexScreener
 */
async function fetchZcPrice(): Promise<number> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${ZC_MINT}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch ZC price');
    }
    const data = await response.json();
    const pair = data.pairs?.[0];
    if (pair?.priceUsd) {
      return parseFloat(pair.priceUsd);
    }
  } catch (error) {
    console.warn('[useBuybackData] Failed to fetch ZC price, using fallback:', error);
  }
  return 0.001; // Fallback price
}

/**
 * Hook to fetch buyback data from chain
 */
export function useBuybackData(daysBack: number = 31): UseBuybackDataResult {
  const [result, setResult] = useState<UseBuybackDataResult>({
    dailyData: [],
    totalZc: 0,
    totalUsd: 0,
    loading: true,
    error: null,
  });

  // Track if component is mounted
  const mountedRef = useRef(true);

  const fetchBuybackData = useCallback(async () => {
    const cacheKey = `buyback-${daysBack}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (mountedRef.current) {
        setResult(cached.data);
      }
      return;
    }

    try {
      const endTime = Date.now();
      const startTime = endTime - daysBack * 24 * 60 * 60 * 1000;

      // Generate all dates in range
      const allDates: string[] = [];
      for (let d = new Date(startTime); d <= new Date(endTime); d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
      }

      console.log('[useBuybackData] Fetching buyback data for', daysBack, 'days...');

      // Fetch transactions from Helius
      const transactions = await fetchFeeWalletTransactions(startTime, endTime);
      console.log('[useBuybackData] Fetched', transactions.length, 'transactions');

      // Detect buybacks (burns + staking vault transfers)
      const dailyBuybacks = detectBuybacks(transactions);
      console.log('[useBuybackData] Detected buybacks for', dailyBuybacks.size, 'days');

      // Fetch ZC price
      const zcPrice = await fetchZcPrice();
      console.log('[useBuybackData] ZC price:', zcPrice);

      // Calculate totals
      let totalZc = 0;
      for (const amount of dailyBuybacks.values()) {
        totalZc += amount;
      }

      // Build daily data with USD values
      const dailyData: DailyBuyback[] = allDates.map(date => {
        const zcAmount = dailyBuybacks.get(date) || 0;
        return {
          date,
          zcAmount,
          usdAmount: zcAmount * zcPrice,
        };
      });

      const totalUsd = totalZc * zcPrice;

      console.log('[useBuybackData] Total ZC bought back:', totalZc.toFixed(2));
      console.log('[useBuybackData] Total USD:', totalUsd.toFixed(2));

      const newResult: UseBuybackDataResult = {
        dailyData,
        totalZc,
        totalUsd,
        loading: false,
        error: null,
      };

      // Update cache
      cache.set(cacheKey, {
        data: newResult,
        timestamp: Date.now(),
      });

      if (mountedRef.current) {
        setResult(newResult);
      }
    } catch (error) {
      console.error('[useBuybackData] Error fetching buyback data:', error);
      if (mountedRef.current) {
        setResult(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch buyback data',
        }));
      }
    }
  }, [daysBack]);

  useEffect(() => {
    mountedRef.current = true;
    fetchBuybackData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchBuybackData]);

  return result;
}
