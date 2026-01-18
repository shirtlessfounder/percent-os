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

import { useState, useEffect, useCallback, useRef } from 'react';
import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';

// Fee wallet addresses
const FEE_WALLETS = [
  'FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC',
  '7rajfxUQBHRXiSrQWQo9FZ2zBbLy4Xvh9yYfa7tkvj4U',
];

const MIN_SOL_AMOUNT = 0.01; // Ignore spam below this threshold
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: UseRevenueDataResult;
  timestamp: number;
}

// Simple in-memory cache
const cache: Map<string, CacheEntry> = new Map();

export interface DailyRevenue {
  date: string;      // YYYY-MM-DD
  solAmount: number; // Daily SOL fees
  usdAmount: number; // Daily USD value
}

export interface UseRevenueDataResult {
  dailyData: DailyRevenue[];
  totalSol: number;
  totalUsd: number;
  loading: boolean;
  error: string | null;
}

/**
 * Calculate SOL inbound for a transaction to a target address
 */
function calculateSOLInbound(tx: ParsedTransactionWithMeta, targetAddress: string): number {
  if (!tx.meta) return 0;

  const accountKeys = tx.transaction.message.accountKeys;
  let targetIndex = -1;

  for (let i = 0; i < accountKeys.length; i++) {
    if (accountKeys[i].pubkey.toBase58() === targetAddress) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) return 0;

  const preBalance = tx.meta.preBalances[targetIndex] || 0;
  const postBalance = tx.meta.postBalances[targetIndex] || 0;
  const diff = postBalance - preBalance;

  // Only count inbound (positive diff), convert from lamports to SOL
  return diff > 0 ? diff / 1e9 : 0;
}

/**
 * Fetch SOL inbound for a specific wallet within a time range
 */
async function getSOLInboundForWallet(
  connection: Connection,
  walletAddress: string,
  startTime: number,
  endTime: number
): Promise<{ daily: Map<string, number>; total: number; txCount: number }> {
  const pubkey = new PublicKey(walletAddress);
  const daily = new Map<string, number>();
  let total = 0;
  let txCount = 0;

  // Fetch all signatures in the time range
  const signatures: { signature: string; blockTime: number | null }[] = [];
  let before: string | undefined = undefined;
  let keepFetching = true;

  while (keepFetching) {
    const sigs = await connection.getSignaturesForAddress(pubkey, {
      before,
      limit: 1000,
    });

    if (sigs.length === 0) break;

    for (const sig of sigs) {
      if (sig.blockTime) {
        const sigTime = sig.blockTime * 1000;
        if (sigTime < startTime) {
          keepFetching = false;
          break;
        }
        if (sigTime <= endTime) {
          signatures.push({ signature: sig.signature, blockTime: sig.blockTime });
        }
      }
    }

    before = sigs[sigs.length - 1].signature;

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  // Process transactions in batches
  const batchSize = 20;
  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    const txs = await connection.getParsedTransactions(
      batch.map(s => s.signature),
      { maxSupportedTransactionVersion: 0 }
    );

    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      const sig = batch[j];
      if (!tx || !sig.blockTime) continue;

      // Look for SOL transfers TO this address
      const solInbound = calculateSOLInbound(tx, walletAddress);

      if (solInbound >= MIN_SOL_AMOUNT) {
        const date = new Date(sig.blockTime * 1000).toISOString().split('T')[0];
        daily.set(date, (daily.get(date) || 0) + solInbound);
        total += solInbound;
        txCount++;
      }
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 50));
  }

  return { daily, total, txCount };
}

/**
 * Hook to fetch fee revenue data from chain
 */
export function useRevenueData(daysBack: number = 31): UseRevenueDataResult {
  const [result, setResult] = useState<UseRevenueDataResult>({
    dailyData: [],
    totalSol: 0,
    totalUsd: 0,
    loading: true,
    error: null,
  });

  // Track if component is mounted
  const mountedRef = useRef(true);

  const fetchRevenueData = useCallback(async () => {
    const cacheKey = `revenue-${daysBack}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (mountedRef.current) {
        setResult(cached.data);
      }
      return;
    }

    try {
      const connection = new Connection(RPC_URL, 'confirmed');
      const endTime = Date.now();
      const startTime = endTime - daysBack * 24 * 60 * 60 * 1000;

      // Generate all dates in range
      const allDates: string[] = [];
      for (let d = new Date(startTime); d <= new Date(endTime); d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
      }

      console.log('[useRevenueData] Fetching revenue data for', daysBack, 'days...');

      // Fetch data for each wallet
      const walletDataPromises = FEE_WALLETS.map(wallet =>
        getSOLInboundForWallet(connection, wallet, startTime, endTime)
      );

      const walletData = await Promise.all(walletDataPromises);

      // Combine data from all wallets
      const combinedDaily = allDates.map(date =>
        walletData.reduce((sum, wallet) => sum + (wallet.daily.get(date) || 0), 0)
      );

      const grandTotal = walletData.reduce((sum, wallet) => sum + wallet.total, 0);

      console.log('[useRevenueData] Total SOL revenue:', grandTotal.toFixed(2));

      // Fetch SOL price for USD conversion
      let solPrice = 200; // Default fallback
      try {
        const priceResponse = await fetch(`${API_BASE_URL}/api/sol-price`);
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          solPrice = priceData.price || 200;
        }
      } catch (priceError) {
        console.warn('[useRevenueData] Failed to fetch SOL price, using default:', priceError);
      }

      // Build daily data with USD values
      const dailyData: DailyRevenue[] = allDates.map((date, idx) => ({
        date,
        solAmount: combinedDaily[idx],
        usdAmount: combinedDaily[idx] * solPrice,
      }));

      const newResult: UseRevenueDataResult = {
        dailyData,
        totalSol: grandTotal,
        totalUsd: grandTotal * solPrice,
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
      console.error('[useRevenueData] Error fetching revenue data:', error);
      if (mountedRef.current) {
        setResult(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch revenue data',
        }));
      }
    }
  }, [daysBack]);

  useEffect(() => {
    mountedRef.current = true;
    fetchRevenueData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchRevenueData]);

  return result;
}
