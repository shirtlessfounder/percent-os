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
import { useProjectMarketCaps } from '@/hooks/useProjectMarketCaps';
import { useProjectTVL } from '@/hooks/useProjectTVL';
import { useRevenueData } from '@/hooks/useRevenueData';
import { useBuybackData } from '@/hooks/useBuybackData';
import { useVolumeChartData } from '@/hooks/useVolumeChartData';
import { useZcMcapHistory } from '@/hooks/useZcMcapHistory';
import { api } from '@/lib/api';

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

function getTimeframeDaysBack(timeframe: Timeframe): number {
  switch (timeframe) {
    case '1d':
      return 1;
    case '1w':
      return 7;
    case '1m':
      return 30;
    case 'all':
    default:
      // Calculate days from ALL_TIME_START to now
      const now = new Date();
      const diffMs = now.getTime() - ALL_TIME_START.getTime();
      return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }
}

// Get the previous timeframe's date range (for % change calculation)
function getPreviousTimeframeDates(timeframe: Timeframe): { from: Date; to: Date } | null {
  if (timeframe === 'all') return null;

  const now = new Date();
  switch (timeframe) {
    case '1d':
      return {
        from: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      };
    case '1w':
      return {
        from: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      };
    case '1m':
      return {
        from: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      };
    default:
      return null;
  }
}

/**
 * Map moderatorId to token slug for pool lookup (old system)
 */
function getTokenSlug(moderatorId: number): string {
  const mapping: Record<number, string> = {
    2: 'zc',
    3: 'oogway',
    6: 'surf',
  };
  return mapping[moderatorId] || 'zc';
}

interface StatsProject {
  moderatorId: number;
  name: string;
  ticker: string;
  logo?: string;
  isFutarchy: boolean;
  baseMint?: string;
  daoPda?: string;
}

// Treasury vault configuration for known projects
// Includes treasury address and native token mint for TVL calculation
interface TreasuryConfig {
  treasuryVault: string;
  tokenMint: string;
}

const KNOWN_TREASURIES: Record<string, TreasuryConfig> = {
  // SURF (old system, moderatorId 6)
  'surf': {
    treasuryVault: 'BmfaxQCRqf4xZFmQa5GswShBZhRBf4bED7hadFkpgBC3',
    tokenMint: 'SurfwRjQQFV6P7JdhxSptf4CjWU8sb88rUiaLCystar',
  },
  // STAR (futarchy)
  'star': {
    treasuryVault: 'EtdhMR3yYHsUP3cm36X83SpvnL5jB48p5b653pqLC23C',
    tokenMint: 'StargWr5r6r8gZSjmEKGZ1dmvKWkj79r2z1xqjFstar',
  },
};

export default function StatsPage() {
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [previousSummary, setPreviousSummary] = useState<StatsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Aggregate ALL proposals by finalization date (for grid display - no timeframe filter)
  const contributions = useMemo(() => {
    const countByDate: Record<string, number> = {};

    for (const proposal of proposals) {
      // Only count finalized proposals (not pending/live ones)
      if (proposal.status === 'Pending') continue;

      // Use local date string to match markets page display
      const dateStr = getLocalDateStr(proposal.finalizedAt);
      countByDate[dateStr] = (countByDate[dateStr] || 0) + 1;
    }

    return Object.entries(countByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [proposals, getLocalDateStr]);

  // Total QMs count (filtered by timeframe for the card display)
  const totalQMs = useMemo(() => {
    let count = 0;
    for (const proposal of proposals) {
      if (proposal.status === 'Pending') continue;
      const date = new Date(proposal.finalizedAt);
      if (date >= fromDate) {
        count++;
      }
    }
    return count;
  }, [proposals, fromDate]);

  // Previous timeframe QM count (for % change calculation)
  const previousQMs = useMemo(() => {
    const prevDates = getPreviousTimeframeDates(timeframe);
    if (!prevDates) return null;

    let count = 0;
    for (const proposal of proposals) {
      if (proposal.status === 'Pending') continue;

      const date = new Date(proposal.finalizedAt);
      if (date >= prevDates.from && date < prevDates.to) {
        count++;
      }
    }
    return count;
  }, [proposals, timeframe]);

  // Calculate % change between current and previous timeframe
  const qmPercentChange = useMemo(() => {
    if (timeframe === 'all' || previousQMs === null) return undefined;
    // Don't show % change if previous timeframe has no data
    if (previousQMs === 0) return undefined;
    return ((totalQMs - previousQMs) / previousQMs) * 100;
  }, [totalQMs, previousQMs, timeframe]);

  // Extract unique active projects from proposals with QMs in the selected timeframe
  const activeProjects = useMemo((): StatsProject[] => {
    const projectMap = new Map<string, StatsProject>();

    for (const p of proposals) {
      // Only count finalized proposals (not pending/live ones)
      if (p.status === 'Pending') continue;

      // Apply timeframe filter
      const date = new Date(p.finalizedAt);
      if (date < fromDate) continue;

      const isFutarchy = p.isFutarchy ?? false;
      const key = isFutarchy
        ? (p.daoName?.toLowerCase() || '')
        : p.moderatorId.toString();

      if (!projectMap.has(key)) {
        projectMap.set(key, {
          moderatorId: p.moderatorId,
          name: isFutarchy ? (p.daoName || '') : p.tokenTicker,
          ticker: p.tokenTicker,
          logo: p.tokenIcon || undefined,
          isFutarchy,
          // For futarchy, tokenMint is available directly
          baseMint: isFutarchy ? p.tokenMint : undefined,
          // daoPda is available on futarchy proposals
          daoPda: isFutarchy ? p.daoPda : undefined,
        });
      }
    }

    return Array.from(projectMap.values());
  }, [proposals, fromDate]);

  // State for baseMints fetched from API (for old system projects)
  const [projectBaseMints, setProjectBaseMints] = useState<Map<number, string>>(new Map());

  // Fetch baseMints for old system projects
  useEffect(() => {
    const fetchBaseMints = async () => {
      const oldSystemProjects = activeProjects.filter(p => !p.isFutarchy && !p.baseMint);
      if (oldSystemProjects.length === 0) return;

      const newMints = new Map<number, string>();

      await Promise.all(
        oldSystemProjects.map(async (project) => {
          try {
            const tokenSlug = getTokenSlug(project.moderatorId);
            const poolData = await api.getPoolByName(tokenSlug);
            if (poolData?.pool?.baseMint) {
              newMints.set(project.moderatorId, poolData.pool.baseMint);
            }
          } catch (err) {
            console.error(`Failed to fetch baseMint for ${project.ticker}:`, err);
          }
        })
      );

      if (newMints.size > 0) {
        setProjectBaseMints(prev => {
          const updated = new Map(prev);
          for (const [id, mint] of newMints) {
            updated.set(id, mint);
          }
          return updated;
        });
      }
    };

    fetchBaseMints();
  }, [activeProjects]);

  // Collect treasury configs only for projects that are currently shown as active
  const allTreasuryConfigs = useMemo(() => {
    const configs: typeof KNOWN_TREASURIES[keyof typeof KNOWN_TREASURIES][] = [];

    for (const project of activeProjects) {
      // Check if this project has a known treasury config
      const key = project.name.toLowerCase();
      if (KNOWN_TREASURIES[key]) {
        configs.push(KNOWN_TREASURIES[key]);
      }
    }

    return configs;
  }, [activeProjects]);

  // Fetch TVL data for all projects (SOL + USDC + native token)
  const { data: tvlData, combinedTvlUsd, loading: tvlLoading } = useProjectTVL(allTreasuryConfigs);

  // Create per-project TVL map (keyed by project name lowercase)
  const projectTvlMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of activeProjects) {
      const key = project.name.toLowerCase();
      const treasuryConfig = KNOWN_TREASURIES[key];
      if (treasuryConfig) {
        const tvlEntry = tvlData.get(treasuryConfig.treasuryVault);
        if (tvlEntry) {
          map.set(key, tvlEntry.tvlUsd);
        }
      }
    }
    return map;
  }, [activeProjects, tvlData]);

  // Collect all baseMints for market cap lookup
  const allBaseMints = useMemo(() => {
    const mints: string[] = [];
    for (const project of activeProjects) {
      if (project.baseMint) {
        mints.push(project.baseMint);
      } else if (!project.isFutarchy && projectBaseMints.has(project.moderatorId)) {
        mints.push(projectBaseMints.get(project.moderatorId)!);
      }
    }
    return mints;
  }, [activeProjects, projectBaseMints]);

  // Fetch market cap data for all projects
  const { data: mcapData, combinedMcap, loading: mcapLoading } = useProjectMarketCaps(allBaseMints);

  // Calculate days back based on timeframe for chart data
  const chartDaysBack = useMemo(() => getTimeframeDaysBack(timeframe), [timeframe]);

  // Fetch 2x days to have data for both current and previous periods
  const fetchDaysBack = useMemo(() => {
    if (timeframe === 'all') return chartDaysBack;
    return chartDaysBack * 2;
  }, [timeframe, chartDaysBack]);

  // Fetch revenue data from chain (fee wallets)
  const {
    dailyData: revenueDaily,
    loading: revenueLoading,
  } = useRevenueData(fetchDaysBack);

  // Fetch buyback data from chain (burns + staking vault transfers)
  const {
    dailyData: buybackDaily,
    loading: buybackLoading,
  } = useBuybackData(fetchDaysBack);

  // Fetch volume chart data (daily aggregates for the volume line chart)
  const {
    dailyData: volumeChartDaily,
    loading: volumeChartLoading,
  } = useVolumeChartData(proposals, fetchDaysBack);

  // Fetch ZC market cap history from GeckoTerminal
  const {
    dailyData: mcapDaily,
    loading: mcapHistoryLoading,
  } = useZcMcapHistory(fetchDaysBack);

  // Calculate current period totals from dailyData
  const totalRevenue = useMemo(() => {
    return revenueDaily
      .filter(d => new Date(d.date) >= fromDate)
      .reduce((sum, d) => sum + d.usdAmount, 0);
  }, [revenueDaily, fromDate]);

  const totalBuybacks = useMemo(() => {
    return buybackDaily
      .filter(d => new Date(d.date) >= fromDate)
      .reduce((sum, d) => sum + d.usdAmount, 0);
  }, [buybackDaily, fromDate]);

  // Calculate previous period totals for percent change
  const previousRevenue = useMemo(() => {
    const prevDates = getPreviousTimeframeDates(timeframe);
    if (!prevDates) return null;

    return revenueDaily
      .filter(d => {
        const date = new Date(d.date);
        return date >= prevDates.from && date < prevDates.to;
      })
      .reduce((sum, d) => sum + d.usdAmount, 0);
  }, [revenueDaily, timeframe]);

  const previousBuybacks = useMemo(() => {
    const prevDates = getPreviousTimeframeDates(timeframe);
    if (!prevDates) return null;

    return buybackDaily
      .filter(d => {
        const date = new Date(d.date);
        return date >= prevDates.from && date < prevDates.to;
      })
      .reduce((sum, d) => sum + d.usdAmount, 0);
  }, [buybackDaily, timeframe]);

  // Calculate percent changes
  const revenuePercentChange = useMemo(() => {
    if (timeframe === 'all' || previousRevenue === null) return undefined;
    if (previousRevenue === 0) return undefined;
    return ((totalRevenue - previousRevenue) / previousRevenue) * 100;
  }, [totalRevenue, previousRevenue, timeframe]);

  const buybackPercentChange = useMemo(() => {
    if (timeframe === 'all' || previousBuybacks === null) return undefined;
    if (previousBuybacks === 0) return undefined;
    return ((totalBuybacks - previousBuybacks) / previousBuybacks) * 100;
  }, [totalBuybacks, previousBuybacks, timeframe]);

  // Total volume (computed from daily chart data)
  const totalVolumeUsd = useMemo(() => {
    return volumeChartDaily
      .filter(d => new Date(d.date) >= fromDate)
      .reduce((sum, d) => sum + d.volume, 0);
  }, [volumeChartDaily, fromDate]);

  // Previous period volume for percent change
  const previousTotalVolumeUsd = useMemo(() => {
    const prevDates = getPreviousTimeframeDates(timeframe);
    if (!prevDates) return 0;

    return volumeChartDaily
      .filter(d => {
        const date = new Date(d.date);
        return date >= prevDates.from && date < prevDates.to;
      })
      .reduce((sum, d) => sum + d.volume, 0);
  }, [volumeChartDaily, timeframe]);

  // Calculate percent change for total volume
  const volumePercentChange = useMemo(() => {
    if (timeframe === 'all') return undefined;
    if (previousTotalVolumeUsd === 0) return undefined;
    return ((totalVolumeUsd - previousTotalVolumeUsd) / previousTotalVolumeUsd) * 100;
  }, [totalVolumeUsd, previousTotalVolumeUsd, timeframe]);

  // Calculate dynamic buyback percentage
  const buybackPercent = useMemo(() => {
    if (totalRevenue > 0 && totalBuybacks > 0) {
      return Math.round((totalBuybacks / totalRevenue) * 100);
    }
    return 0;
  }, [totalRevenue, totalBuybacks]);

  // Convert revenue data to chart format (filtered by timeframe)
  const revenueChartData = useMemo(() => {
    return revenueDaily
      .filter(d => new Date(d.date) >= fromDate)
      .map(d => ({ date: d.date, volume: d.usdAmount }));
  }, [revenueDaily, fromDate]);

  // Convert buyback data to chart format (filtered by timeframe)
  const buybackChartData = useMemo(() => {
    return buybackDaily
      .filter(d => new Date(d.date) >= fromDate)
      .map(d => ({ date: d.date, volume: d.usdAmount }));
  }, [buybackDaily, fromDate]);

  // Convert volume chart data to chart format (filtered by timeframe)
  const volumeChartData = useMemo(() => {
    return volumeChartDaily
      .filter(d => new Date(d.date) >= fromDate)
      .map(d => ({ date: d.date, volume: d.volume }));
  }, [volumeChartDaily, fromDate]);

  // Convert ZC MCap data to chart format (filtered by timeframe)
  const mcapChartData = useMemo(() => {
    return mcapDaily
      .filter(d => new Date(d.date) >= fromDate)
      .map(d => ({ date: d.date, volume: d.mcapUsd }));
  }, [mcapDaily, fromDate]);

  // Create per-project MCap map (keyed by project name lowercase)
  const projectMcapMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of activeProjects) {
      const key = project.name.toLowerCase();
      // Get the baseMint for this project
      let baseMint = project.baseMint;
      if (!baseMint && !project.isFutarchy) {
        baseMint = projectBaseMints.get(project.moderatorId);
      }
      if (baseMint) {
        const mcapEntry = mcapData.get(baseMint);
        if (mcapEntry?.mcapUsd !== null && mcapEntry?.mcapUsd !== undefined) {
          map.set(key, mcapEntry.mcapUsd);
        }
      }
    }
    return map;
  }, [activeProjects, mcapData, projectBaseMints]);

  const activeProjectsCount = activeProjects.length;

  // Previous timeframe active projects count (for % change calculation)
  const previousActiveProjectsCount = useMemo(() => {
    const prevDates = getPreviousTimeframeDates(timeframe);
    if (!prevDates) return null;

    const projectMap = new Map<string, boolean>();

    for (const p of proposals) {
      if (p.status === 'Pending') continue;

      const date = new Date(p.finalizedAt);
      if (date >= prevDates.from && date < prevDates.to) {
        const key = p.isFutarchy
          ? (p.daoName?.toLowerCase() || '')
          : p.moderatorId.toString();
        projectMap.set(key, true);
      }
    }

    return projectMap.size;
  }, [proposals, timeframe]);

  // Calculate % change for active projects
  const activeProjectsPercentChange = useMemo(() => {
    if (timeframe === 'all' || previousActiveProjectsCount === null) return undefined;
    if (previousActiveProjectsCount === 0) return undefined;
    return ((activeProjectsCount - previousActiveProjectsCount) / previousActiveProjectsCount) * 100;
  }, [activeProjectsCount, previousActiveProjectsCount, timeframe]);

  const loading = proposalsLoading || summaryLoading || buybackLoading || volumeChartLoading;

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

      // Fetch previous period summary for percent change
      const prevDates = getPreviousTimeframeDates(timeframe);
      if (prevDates) {
        const prevParams = new URLSearchParams();
        prevParams.set('from', prevDates.from.toISOString());
        prevParams.set('to', prevDates.to.toISOString());

        const prevSummaryRes = await fetch(`${API_BASE_URL}/api/stats/summary?${prevParams}`);
        if (prevSummaryRes.ok) {
          const prevData = await prevSummaryRes.json();
          setPreviousSummary(prevData);
        }
      } else {
        setPreviousSummary(null);
      }

    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setSummaryLoading(false);
      if (isRefresh) {
        // Hold the refreshing state for 1 second after completion
        setTimeout(() => setRefreshing(false), 1000);
      }
    }
  }, [fromDate, timeframe]);

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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="h-full">
                  <TotalQMsCard
                    value={totalQMs}
                    loading={loading}
                    timeframe={timeframe}
                    percentChange={qmPercentChange}
                  />
                </div>
                <div className="md:col-span-2">
                  <ContributionGrid data={contributions} loading={loading} startDate={fromDate} />
                </div>
              </div>

              {/* Mobile only - ActiveProjectsCard appears here (between grid and chart) */}
              <ActiveProjectsCard
                count={activeProjectsCount}
                projects={activeProjects}
                loading={loading}
                timeframe={timeframe}
                percentChange={activeProjectsPercentChange}
                combinedMcapUsd={combinedMcap}
                mcapLoading={mcapLoading}
                combinedTvlUsd={combinedTvlUsd}
                tvlLoading={tvlLoading}
                projectTvlMap={projectTvlMap}
                projectMcapMap={projectMcapMap}
                className="md:hidden"
              />

              {/* Volume Chart (full width, own section) */}
              <div>
                <VolumeChartCard
                  revenueData={revenueChartData}
                  buybackData={buybackChartData}
                  volumeData={volumeChartData}
                  mcapData={mcapChartData}
                  loading={loading || revenueLoading || volumeChartLoading || mcapHistoryLoading}
                />
              </div>
            </div>

            {/* Right 1/3 area - Stacked metric cards */}
            <div className="flex flex-col gap-4">
              {/* Desktop only - ActiveProjectsCard in right column */}
              <ActiveProjectsCard
                count={activeProjectsCount}
                projects={activeProjects}
                loading={loading}
                timeframe={timeframe}
                percentChange={activeProjectsPercentChange}
                combinedMcapUsd={combinedMcap}
                mcapLoading={mcapLoading}
                combinedTvlUsd={combinedTvlUsd}
                tvlLoading={tvlLoading}
                projectTvlMap={projectTvlMap}
                projectMcapMap={projectMcapMap}
                className="hidden md:flex"
              />
              <FlipMetricCard
                label={buybackPercent > 0 ? `Buybacks · ${buybackPercent}% of revenue` : 'Buybacks'}
                value={totalBuybacks}
                loading={loading || buybackLoading}
                prefix="$"
                percentChange={buybackPercentChange}
                timeframe={timeframe}
              />
              <FlipMetricCard
                label="Revenue"
                value={totalRevenue}
                loading={loading || revenueLoading}
                prefix="$"
                percentChange={revenuePercentChange}
                timeframe={timeframe}
              />
              <FlipMetricCard
                label="Futarchy Volume"
                value={totalVolumeUsd}
                loading={loading || volumeChartLoading}
                prefix="$"
                percentChange={volumePercentChange}
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
