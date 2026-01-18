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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

/**
 * Hook to fetch buyback data from the backend API
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
    const cached = cache.get(cacheKey);

    // Stale-while-revalidate: show cached data immediately if available
    if (cached) {
      if (mountedRef.current) {
        setResult(cached.data);
      }
      // If cache is fresh, don't refetch
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return;
      }
      // Cache is stale - continue to refetch in background (no loading state)
    }

    try {
      console.log('[useBuybackData] Fetching buyback data for', daysBack, 'days...');

      const response = await fetch(`${API_BASE_URL}/api/stats/buybacks?daysBack=${daysBack}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as {
        dailyData: DailyBuyback[];
        totalZc: number;
        totalUsd: number;
      };

      console.log('[useBuybackData] Total ZC bought back:', data.totalZc.toFixed(2));
      console.log('[useBuybackData] Total USD:', data.totalUsd.toFixed(2));

      const newResult: UseBuybackDataResult = {
        dailyData: data.dailyData,
        totalZc: data.totalZc,
        totalUsd: data.totalUsd,
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
