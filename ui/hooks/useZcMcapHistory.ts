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

// ZC token address on Solana
const ZC_TOKEN_ADDRESS = 'GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC';

// ZC total supply: 1 billion tokens
const ZC_TOTAL_SUPPLY = 1_000_000_000;

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: UseZcMcapHistoryResult;
  timestamp: number;
}

// Simple in-memory cache
const cache: Map<string, CacheEntry> = new Map();

export interface DailyMcap {
  date: string;      // YYYY-MM-DD
  mcapUsd: number;   // Market cap in USD
}

export interface UseZcMcapHistoryResult {
  dailyData: DailyMcap[];
  loading: boolean;
  error: string | null;
}

interface BirdeyeOHLCVItem {
  unixTime: number;
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

interface BirdeyeOHLCVResponse {
  success: boolean;
  data: {
    items: BirdeyeOHLCVItem[];
  };
}

/**
 * Hook to fetch ZC token market cap history from Birdeye
 * Uses OHLCV data and calculates MCap from close price * total supply
 */
export function useZcMcapHistory(daysBack: number = 31): UseZcMcapHistoryResult {
  const [result, setResult] = useState<UseZcMcapHistoryResult>({
    dailyData: [],
    loading: true,
    error: null,
  });

  // Track if component is mounted
  const mountedRef = useRef(true);

  const fetchMcapData = useCallback(async () => {
    const cacheKey = `zc-mcap-${daysBack}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (mountedRef.current) {
        setResult(cached.data);
      }
      return;
    }

    try {
      console.log('[useZcMcapHistory] Fetching ZC MCap data for', daysBack, 'days...');

      // Birdeye OHLCV endpoint for daily candles
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - (daysBack * 24 * 60 * 60);

      const url = `https://public-api.birdeye.so/defi/ohlcv?address=${ZC_TOKEN_ADDRESS}&type=1D&time_from=${startTime}&time_to=${endTime}`;

      const response = await fetch(url, {
        headers: {
          'X-API-KEY': process.env.NEXT_PUBLIC_BIRDEYE_API_KEY || '',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status} ${response.statusText}`);
      }

      const data: BirdeyeOHLCVResponse = await response.json();

      if (!data.success || !data.data?.items) {
        throw new Error('Invalid response format from Birdeye');
      }

      const items = data.data.items;

      // Convert OHLCV data to daily MCap
      const dailyData: DailyMcap[] = items
        .map(item => {
          const date = new Date(item.unixTime * 1000).toISOString().split('T')[0];
          const mcapUsd = item.c * ZC_TOTAL_SUPPLY; // close price * total supply

          return {
            date,
            mcapUsd,
          };
        })
        // Sort by date ascending
        .sort((a, b) => a.date.localeCompare(b.date));

      console.log('[useZcMcapHistory] Fetched', dailyData.length, 'days of MCap data');

      const newResult: UseZcMcapHistoryResult = {
        dailyData,
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
      console.error('[useZcMcapHistory] Error fetching MCap data:', error);
      if (mountedRef.current) {
        setResult(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch MCap data',
        }));
      }
    }
  }, [daysBack]);

  useEffect(() => {
    mountedRef.current = true;
    fetchMcapData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchMcapData]);

  return result;
}
