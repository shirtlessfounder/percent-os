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

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import ExploreHeader from '@/components/ExploreHeader';
import StatsFilters from '@/components/stats/StatsFilters';
import FlipMetricCard from '@/components/stats/FlipMetricCard';
import ActiveProjectsCard from '@/components/stats/ActiveProjectsCard';
import TotalQMsCard from '@/components/stats/TotalQMsCard';
import ContributionGrid from '@/components/stats/ContributionGrid';
import VolumeChartCard from '@/components/stats/VolumeChartCard';
import { useAllProposals } from '@/hooks/useAllProposals';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// All-time start date: Oct 1, 2025
const ALL_TIME_START = new Date('2025-10-01T00:00:00Z');

export type Timeframe = '1d' | '1w' | '1m' | 'all';

interface StatsSummary {
  proposals: { total: number; byModerator: Record<number, number> };
  proposers: { total: number; byModerator: Record<number, number> };
  traders: { total: number; byModerator: Record<number, number> };
  volume: { totalUsd: number; byModerator: Record<number, number> };
  averages: { volumePerQM: number; tradersPerQM: number };
  stakers: { volumeUsd: number; count: number; participatingCount: number };
  // Placeholder fields for future backend implementation
  tvl?: { totalUsd: number; byModerator: Record<number, number> };
  mcap?: { totalUsd: number; byModerator: Record<number, number> };
  fees?: { totalUsd: number; buybackUsd: number };
  global?: {
    integratedProjects: number;
    staking: {
      tvl: number;
      stakerCount: number;
      percentStaked: number;
      apy: number;
    };
  };
}

function getTimeframeDate(timeframe: Timeframe): Date {
  const now = new Date();
  switch (timeframe) {
    case '1d':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '1w':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '1m':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return ALL_TIME_START;
  }
}

export default function StatsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch all proposals using the same hook as markets page
  const { proposals: allProposals, loading: proposalsLoading, refetch: refetchProposals } = useAllProposals();

  // Filter proposals: only ZC (moderatorId 2), SURF (moderatorId 6), and star futarchy
  const proposals = useMemo(() => {
    return allProposals.filter(p => {
      if (!p.isFutarchy) {
        // Old system: only ZC (2) and SURF (6)
        return p.moderatorId === 2 || p.moderatorId === 6;
      }
      // Futarchy: only star
      return p.daoName?.toLowerCase() === 'star';
    });
  }, [allProposals]);

  const fromDate = useMemo(() => getTimeframeDate(timeframe), [timeframe]);

  // Helper to get local date string (YYYY-MM-DD) matching markets page display
  const getLocalDateStr = useCallback((timestamp: number): string => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Aggregate proposals by finalization date (matches what's displayed on markets page)
  const contributions = useMemo(() => {
    const countByDate: Record<string, number> = {};

    for (const proposal of proposals) {
      // Only count finalized proposals (not pending/live ones)
      if (proposal.status === 'Pending') continue;

      const date = new Date(proposal.finalizedAt);

      // Apply timeframe filter
      if (date < fromDate) continue;

      // Use local date string to match markets page display
      const dateStr = getLocalDateStr(proposal.finalizedAt);
      countByDate[dateStr] = (countByDate[dateStr] || 0) + 1;
    }

    return Object.entries(countByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [proposals, fromDate, getLocalDateStr]);

  // Total QMs count (same filtering as contributions)
  const totalQMs = useMemo(() => {
    return contributions.reduce((sum, c) => sum + c.count, 0);
  }, [contributions]);

  // Extract unique active projects from proposals with QMs in the selected timeframe
  const activeProjects = useMemo(() => {
    const projectMap = new Map<string, { moderatorId: number; name: string; ticker: string; logo?: string }>();

    for (const p of proposals) {
      // Only count finalized proposals (not pending/live ones)
      if (p.status === 'Pending') continue;

      // Apply timeframe filter
      const date = new Date(p.finalizedAt);
      if (date < fromDate) continue;

      const key = p.isFutarchy
        ? (p.daoName?.toLowerCase() || '')
        : p.moderatorId.toString();

      if (!projectMap.has(key)) {
        projectMap.set(key, {
          moderatorId: p.moderatorId,
          name: p.isFutarchy ? (p.daoName || '') : p.tokenTicker,
          ticker: p.tokenTicker,
          logo: p.tokenIcon || undefined,
        });
      }
    }

    return Array.from(projectMap.values());
  }, [proposals, fromDate]);

  const activeProjectsCount = activeProjects.length;

  const loading = proposalsLoading || summaryLoading;

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setSummaryLoading(true);

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('from', fromDate.toISOString());

      // Fetch summary (contribution grid and projects come from useAllProposals)
      const summaryRes = await fetch(`${API_BASE_URL}/api/stats/summary?${params}`);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setSummaryLoading(false);
      if (isRefresh) {
        // Hold the refreshing state for 1 second after completion
        setTimeout(() => setRefreshing(false), 1000);
      }
    }
  }, [fromDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData(true);
    refetchProposals();
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <ExploreHeader activeTab="stats" />

      <main className="flex justify-center">
        <div className="w-full max-w-[1332px] 2xl:max-w-[1512px] pt-8 px-4 md:px-0">
          {/* Header with title, filters, and refresh */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#E9E9E3' }}>
                Combinator Stats
              </h1>
              {lastUpdated && (
                <p className="text-xs mt-1" style={{ color: '#6B6E71' }}>
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <StatsFilters
                timeframe={timeframe}
                onTimeframeChange={setTimeframe}
              />
              <div className="flex items-center p-[4px] border border-[#191919] rounded-full">
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className={`p-2 rounded-full cursor-pointer disabled:cursor-not-allowed ${
                    refreshing ? 'bg-[#DDDDD7]' : ''
                  }`}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                    style={{ color: refreshing ? '#161616' : '#6B6E71' }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* 2/3 + 1/3 Column Layout */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Left 2/3 area - cards can be 1/3 or 2/3 of this area */}
            <div className="md:col-span-2 flex flex-col gap-4">
              {/* Total QMs (1/3) + QM Grid (2/3) */}
              <div className="grid grid-cols-3 gap-4">
                <div className="h-full">
                  <TotalQMsCard
                    value={totalQMs}
                    loading={loading}
                    timeframe={timeframe}
                    percentChange={0}
                  />
                </div>
                <div className="col-span-2">
                  <ContributionGrid data={contributions} loading={loading} startDate={fromDate} />
                </div>
              </div>

              {/* Volume Chart (full width, own section) */}
              <div>
                <VolumeChartCard
                  data={contributions.map(c => ({ date: c.date, volume: c.count }))}
                  loading={loading}
                />
              </div>
            </div>

            {/* Right 1/3 area - Stacked metric cards */}
            <div className="flex flex-col gap-4">
              <ActiveProjectsCard
                count={activeProjectsCount}
                projects={activeProjects}
                loading={loading}
                timeframe={timeframe}
                percentChange={0}
              />
              <FlipMetricCard
                label="Buybacks · 90% of revenue"
                value={summary?.averages.volumePerQM || 0}
                loading={loading}
                prefix="$"
                percentChange={0}
                timeframe={timeframe}
              />
              <FlipMetricCard
                label="Revenue"
                value={summary?.averages.volumePerQM || 0}
                loading={loading}
                prefix="$"
                percentChange={0}
                timeframe={timeframe}
              />
              <FlipMetricCard
                label="Futarchy Volume"
                value={summary?.averages.volumePerQM || 0}
                loading={loading}
                prefix="$"
                percentChange={0}
                timeframe={timeframe}
              />
            </div>
          </div>

          {/* Footer spacing */}
          <div className="h-16" />
        </div>
      </main>
    </div>
  );
}
