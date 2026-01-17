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

import { useEffect, useRef, useMemo, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, AreaData, Time, AreaSeries } from 'lightweight-charts';

export interface VolumeDataPoint {
  date: string;
  volume: number;
}

interface VolumeChartCardProps {
  revenueData?: VolumeDataPoint[];       // Daily revenue
  buybackData?: VolumeDataPoint[];       // Buybacks (90% of revenue)
  volumeData?: VolumeDataPoint[];        // Futarchy volume
  mcapData?: VolumeDataPoint[];          // ZC market cap history
  loading?: boolean;
}

// Series color configuration
const SERIES_COLORS = {
  buyback: { line: '#BEE8FC', top: 'rgba(190, 232, 252, 0.1)', bottom: 'transparent' },
  revenue: { line: '#5a9aba', top: 'rgba(90, 154, 186, 0.1)', bottom: 'transparent' },
  volume: { line: '#2a6a8a', top: 'rgba(42, 106, 138, 0.1)', bottom: 'transparent' },
  mcap: { line: '#1a3a4a', top: 'rgba(26, 58, 74, 0.1)', bottom: 'transparent' },
};

type SeriesKey = keyof typeof SERIES_COLORS;

export default function VolumeChartCard({
  revenueData,
  buybackData,
  volumeData,
  mcapData,
  loading = false,
}: VolumeChartCardProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Map<SeriesKey, ISeriesApi<"Area">>>(new Map());
  const [activeViews, setActiveViews] = useState<SeriesKey[]>(['revenue']);

  const toggleView = (view: SeriesKey) => {
    setActiveViews(prev =>
      prev.includes(view)
        ? prev.filter(v => v !== view)
        : [...prev, view]
    );
  };

  // Convert data arrays to chart format
  const chartDataSets = useMemo(() => {
    const convert = (data?: VolumeDataPoint[]) =>
      data?.map(d => ({ time: d.date as Time, value: d.volume })) || [];

    return {
      buyback: convert(buybackData),
      revenue: convert(revenueData),
      volume: convert(volumeData),
      mcap: convert(mcapData),
    };
  }, [buybackData, revenueData, volumeData, mcapData]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || loading) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#6B6E71',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      rightPriceScale: {
        borderColor: '#1a1a1a',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#1a1a1a',
        timeVisible: false,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: {
          color: '#5a9aba',
          width: 1,
          style: 2,
          labelBackgroundColor: '#5a9aba',
        },
        horzLine: {
          color: '#5a9aba',
          width: 1,
          style: 2,
          labelBackgroundColor: '#5a9aba',
        },
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainerRef.current);

    // Initial size
    handleResize();

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRefs.current.clear();
      }
    };
  }, [loading]);

  // Update series based on activeViews and data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || loading) return;

    const allSeriesKeys: SeriesKey[] = ['buyback', 'revenue', 'volume', 'mcap'];

    for (const key of allSeriesKeys) {
      const data = chartDataSets[key];
      const isActive = activeViews.includes(key);
      const existingSeries = seriesRefs.current.get(key);

      if (isActive && data.length > 0) {
        if (!existingSeries) {
          // Create series
          const colors = SERIES_COLORS[key];
          const series = chart.addSeries(AreaSeries, {
            lineColor: colors.line,
            topColor: colors.top,
            bottomColor: colors.bottom,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: true,
            crosshairMarkerRadius: 4,
            crosshairMarkerBackgroundColor: colors.line,
            crosshairMarkerBorderColor: '#ffffff',
            crosshairMarkerBorderWidth: 2,
          });
          series.setData(data as AreaData<Time>[]);
          seriesRefs.current.set(key, series);
        } else {
          // Update data
          existingSeries.setData(data as AreaData<Time>[]);
        }
      } else if (!isActive && existingSeries) {
        // Remove series
        chart.removeSeries(existingSeries);
        seriesRefs.current.delete(key);
      }
    }

    // Fit content when data changes
    chart.timeScale().fitContent();
  }, [activeViews, chartDataSets, loading]);

  // Check if we have any data to display
  const hasData = useMemo(() => {
    return Object.values(chartDataSets).some(data => data.length > 0);
  }, [chartDataSets]);

  if (loading) {
    return (
      <div
        className="rounded-[9px] border flex flex-col"
        style={{ backgroundColor: '#121212', borderColor: '#191919' }}
      >
        <div className="px-5 pt-4 pb-4 flex items-center justify-between">
          <span
            className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase"
            style={{ color: '#DDDDD7' }}
          >
            Combinator Charts
          </span>
          <div className="h-7 w-64 rounded-full animate-pulse bg-[#191919]" />
        </div>
        <div className="px-4 pb-4">
          <div className="h-[480px] rounded-lg border border-[#191919] animate-pulse bg-[#0d0d0d]" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-[9px] border flex flex-col"
      style={{ backgroundColor: '#121212', borderColor: '#191919' }}
    >
      {/* Title and Toggle */}
      <div className="px-5 pt-4 pb-4 flex items-center justify-between">
        <span
          className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase"
          style={{ color: '#DDDDD7' }}
        >
          Combinator Charts
        </span>

        {/* Multi-select Toggle */}
        <div className="flex items-center gap-[2px] p-[3px] border border-[#191919] rounded-full">
          <button
            onClick={() => toggleView('buyback')}
            className="px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer font-ibm-plex-mono"
            style={activeViews.includes('buyback')
              ? { backgroundColor: '#BEE8FC', color: '#161616' }
              : { backgroundColor: 'transparent', color: '#6B6E71' }}
          >
            Buybacks
          </button>
          <button
            onClick={() => toggleView('revenue')}
            className="px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer font-ibm-plex-mono"
            style={activeViews.includes('revenue')
              ? { backgroundColor: '#5a9aba', color: '#ffffff' }
              : { backgroundColor: 'transparent', color: '#6B6E71' }}
          >
            Revenue
          </button>
          <button
            onClick={() => toggleView('volume')}
            className="px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer font-ibm-plex-mono"
            style={activeViews.includes('volume')
              ? { backgroundColor: '#2a6a8a', color: '#ffffff' }
              : { backgroundColor: 'transparent', color: '#6B6E71' }}
          >
            Futarchy Vol
          </button>
          <button
            onClick={() => toggleView('mcap')}
            className="px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer font-ibm-plex-mono"
            style={activeViews.includes('mcap')
              ? { backgroundColor: '#1a3a4a', color: '#ffffff' }
              : { backgroundColor: 'transparent', color: '#6B6E71' }}
          >
            ZC MCap
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div className="px-4 pb-4">
        <div
          ref={chartContainerRef}
          className="w-full h-[480px] rounded-lg border border-[#191919]"
        >
          {!hasData && (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-sm font-ibm-plex-mono" style={{ color: '#6B6E71' }}>
                No data available for selected views
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
