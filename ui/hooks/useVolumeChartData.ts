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
import { ExploreProposal } from '@/hooks/useAllProposals';
import { getFutarchyChartData } from '@/lib/monitor-api';
import { api } from '@/lib/api';

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: UseVolumeChartDataResult;
  timestamp: number;
}

// Simple in-memory cache
const cache: Map<string, CacheEntry> = new Map();

export interface DailyVolumeData {
  date: string;      // YYYY-MM-DD
  volume: number;    // USD amount
}

export interface UseVolumeChartDataResult {
  dailyData: DailyVolumeData[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch daily volume chart data for all proposals
 * Aggregates volume by date across old system and futarchy proposals
 */
export function useVolumeChartData(
  proposals: ExploreProposal[],
  daysBack: number
): UseVolumeChartDataResult {
  const [result, setResult] = useState<UseVolumeChartDataResult>({
    dailyData: [],
    loading: true,
    error: null,
  });

  // Track if component is mounted
  const mountedRef = useRef(true);

  const fetchVolumeChartData = useCallback(async () => {
    // Filter to only finalized proposals (not pending)
    const finalizedProposals = proposals.filter(p => p.status !== 'Pending');

    if (finalizedProposals.length === 0) {
      if (mountedRef.current) {
        setResult({
          dailyData: [],
          loading: false,
          error: null,
        });
      }
      return;
    }

    // Create cache key based on proposals and daysBack
    // v9: Use dedicated /daily-volume endpoint (same logic as /volume, bucketed by day)
    const proposalIds = finalizedProposals.map(p => p.isFutarchy ? p.proposalPda : `${p.moderatorId}-${p.id}`).sort().join(',');
    const cacheKey = `volume-chart-v9-${daysBack}-${proposalIds}`;

    // Check cache first
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      if (mountedRef.current) {
        setResult(cached.data);
      }
      return;
    }

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - daysBack * 24 * 60 * 60 * 1000);

      // Generate all dates in range
      const allDates: string[] = [];
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        allDates.push(d.toISOString().split('T')[0]);
      }

      // Map to aggregate volume by date
      const volumeByDate = new Map<string, number>();

      // Initialize all dates with 0
      for (const date of allDates) {
        volumeByDate.set(date, 0);
      }

      // Fetch daily volume for each proposal in parallel
      // Uses dedicated /daily-volume endpoint with same logic as /volume
      await Promise.all(
        finalizedProposals.map(async (proposal) => {
          try {
            if (proposal.isFutarchy && proposal.proposalPda) {
              // Futarchy: use Monitor API chart endpoint (no futarchy proposals exist yet)
              // TODO: Create dedicated /daily-volume endpoint for futarchy when needed
              const chartData = await getFutarchyChartData(proposal.proposalPda, '1d', startDate, endDate);
              if (chartData?.data) {
                // Volume is duplicated across markets - only count once per date
                const seenDates = new Set<string>();
                for (const point of chartData.data) {
                  const date = point.timestamp.split('T')[0];
                  if (seenDates.has(date)) continue;
                  seenDates.add(date);
                  const volumeUsd = parseFloat((point as any).volumeUsd || point.volume || '0');
                  const currentVolume = volumeByDate.get(date) || 0;
                  volumeByDate.set(date, currentVolume + volumeUsd);
                }
              }
            } else {
              // Old system: use dedicated /daily-volume endpoint
              const dailyVolume = await api.getDailyVolume(proposal.id, startDate, endDate, proposal.moderatorId);
              if (dailyVolume?.data) {
                for (const point of dailyVolume.data) {
                  const currentVolume = volumeByDate.get(point.date) || 0;
                  volumeByDate.set(point.date, currentVolume + point.volumeUsd);
                }
              }
            }
          } catch (err) {
            console.error(`[useVolumeChartData] Failed to fetch volume for proposal ${proposal.id}:`, err);
          }
        })
      );

      // Convert map to sorted array
      const dailyData: DailyVolumeData[] = allDates.map(date => ({
        date,
        volume: volumeByDate.get(date) || 0,
      }));

      const newResult: UseVolumeChartDataResult = {
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
      console.error('[useVolumeChartData] Error fetching volume chart data:', error);
      if (mountedRef.current) {
        setResult(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch volume chart data',
        }));
      }
    }
  }, [proposals, daysBack]);

  useEffect(() => {
    mountedRef.current = true;
    setResult(prev => ({ ...prev, loading: true }));
    fetchVolumeChartData();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchVolumeChartData]);

  return result;
}
