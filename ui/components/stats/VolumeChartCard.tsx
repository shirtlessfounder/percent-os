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

interface VolumeDataPoint {
  date: string;
  volume: number;
}

interface VolumeChartCardProps {
  data: VolumeDataPoint[];
  loading?: boolean;
}

export default function VolumeChartCard({ data, loading = false }: VolumeChartCardProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [activeViews, setActiveViews] = useState<string[]>(['buyback']);

  const toggleView = (view: string) => {
    setActiveViews(prev =>
      prev.includes(view)
        ? prev.filter(v => v !== view)
        : [...prev, view]
    );
  };

  // Convert data to lightweight-charts format
  const chartData = useMemo(() => {
    return data.map(d => ({
      time: d.date as Time,
      value: d.volume,
    }));
  }, [data]);

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

    // Add area series (v5 API) - using #5a9aba blue accent, no shading
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#5a9aba',
      topColor: 'transparent',
      bottomColor: 'transparent',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: '#5a9aba',
      crosshairMarkerBorderColor: '#ffffff',
      crosshairMarkerBorderWidth: 2,
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // Set data
    if (chartData.length > 0) {
      areaSeries.setData(chartData as AreaData<Time>[]);
      chart.timeScale().fitContent();
    }

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
        seriesRef.current = null;
      }
    };
  }, [loading]);

  // Update data when it changes
  useEffect(() => {
    if (seriesRef.current && chartData.length > 0) {
      seriesRef.current.setData(chartData as AreaData<Time>[]);
      chartRef.current?.timeScale().fitContent();
    }
  }, [chartData]);

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
              ? { backgroundColor: '#1a3a4a', color: '#ffffff' }
              : { backgroundColor: 'transparent', color: '#6B6E71' }}
          >
            Futarchy Vol
          </button>
          <button
            onClick={() => toggleView('mcap')}
            className="px-3 py-1 rounded-full text-xs font-medium transition cursor-pointer font-ibm-plex-mono"
            style={activeViews.includes('mcap')
              ? { backgroundColor: '#2a6a8a', color: '#ffffff' }
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
        />
      </div>
    </div>
  );
}
