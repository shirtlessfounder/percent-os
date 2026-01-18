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

'use client';

import { useMemo, useState } from 'react';

interface ContributionData {
  date: string;
  count: number;
}

interface ContributionGridProps {
  data: ContributionData[];
  loading?: boolean;
  startDate?: Date; // Start date for the grid (defaults to 52 weeks ago)
}

// Blue gradient color scale using #BEE8FC accent
function getColorForCount(count: number): string {
  if (count === 0) return '#161b22';
  if (count <= 2) return '#1a3a4a';
  if (count <= 5) return '#2a6a8a';
  if (count <= 10) return '#5a9aba';
  return '#BEE8FC';
}

function formatDate(dateStr: string): string {
  // Parse YYYY-MM-DD as local time (not UTC)
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ContributionGrid({ data, loading = false, startDate }: ContributionGridProps) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null);

  // Build a map from date string to count
  const countMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of data) {
      map[item.date] = item.count;
    }
    return map;
  }, [data]);

  // Generate weeks of data from startDate to today
  const weeks = useMemo(() => {
    const result: { date: Date; dateStr: string }[][] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Use provided startDate or default to 52 weeks ago
    const gridStart = new Date(startDate || new Date(today.getTime() - 52 * 7 * 24 * 60 * 60 * 1000));
    gridStart.setHours(0, 0, 0, 0);
    // Align to Sunday
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    let currentWeek: { date: Date; dateStr: string }[] = [];
    const current = new Date(gridStart);

    while (current <= today) {
      // Use local date string to match stats page and markets page display
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      currentWeek.push({ date: new Date(current), dateStr });

      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }

      current.setDate(current.getDate() + 1);
    }

    // Push remaining days
    if (currentWeek.length > 0) {
      result.push(currentWeek);
    }

    return result;
  }, [startDate]);

  // Get month labels for the header
  const monthLabels = useMemo(() => {
    const labels: { month: string; colIndex: number }[] = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
      const firstDayOfWeek = week[0]?.date;
      if (firstDayOfWeek) {
        const month = firstDayOfWeek.getMonth();
        if (month !== lastMonth) {
          labels.push({ month: MONTHS[month], colIndex: weekIndex });
          lastMonth = month;
        }
      }
    });

    return labels;
  }, [weeks]);

  if (loading) {
    return (
      <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5 flex flex-col">
        {/* Inner border matching loaded state */}
        <div className="border border-[#191919] rounded-lg px-3 pt-5 pb-6 flex-1">
          <div className="h-[180px] rounded animate-pulse bg-[#292929]" />
        </div>
        {/* Title and Legend */}
        <div className="flex items-center justify-between mt-7">
          <span className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase" style={{ color: '#DDDDD7' }}>
            Global Activity
          </span>
          <div className="h-4 w-24 rounded animate-pulse bg-[#292929]" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5">
      {/* Inner border around grid area */}
      <div className="border border-[#191919] rounded-lg px-3 pt-5 pb-6 overflow-x-auto">
        {/* Wrapper to keep month labels aligned with grid */}
        <div className="inline-block">
          {/* Month labels */}
          <div className="flex mb-2 relative" style={{ height: '16px' }}>
          {monthLabels.map((label) => (
            <div
              key={`${label.month}-${label.colIndex}`}
              className="text-xs font-ibm-plex-mono absolute"
              style={{
                color: '#6B6E71',
                left: `${label.colIndex * 26}px`, // 24px square + 2px gap
              }}
            >
              {label.month}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex gap-[2px] relative">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[2px]">
              {DAYS_OF_WEEK.map((_, dayIndex) => {
                const dayData = week.find((d) => d.date.getDay() === dayIndex);
                if (!dayData) {
                  return <div key={dayIndex} className="w-[24px] h-[24px]" />;
                }

                const count = countMap[dayData.dateStr] || 0;
                const color = getColorForCount(count);

                return (
                  <div
                    key={dayIndex}
                    className="w-[24px] h-[24px] rounded cursor-pointer transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        date: dayData.dateStr,
                        count,
                        x: rect.left,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          ))}

          {/* Tooltip */}
          {tooltip && (
            <div
              className="fixed z-50 px-2 py-1 text-xs rounded shadow-lg pointer-events-none"
              style={{
                backgroundColor: '#292929',
                color: '#E9E9E3',
                left: tooltip.x - 60,
                top: tooltip.y - 32,
              }}
            >
              <strong>{tooltip.count} QM{tooltip.count !== 1 ? 's' : ''}</strong> on {formatDate(tooltip.date)}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Title and Legend */}
      <div className="flex items-center justify-between mt-7">
        <span className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase" style={{ color: '#DDDDD7' }}>
          Global Activity
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-ibm-plex-mono" style={{ color: '#6B6E71' }}>Less</span>
        {[0, 2, 5, 10, 15].map((level) => (
          <div
            key={level}
            className="w-4 h-4 rounded"
            style={{ backgroundColor: getColorForCount(level) }}
          />
        ))}
        <span className="text-xs font-ibm-plex-mono" style={{ color: '#6B6E71' }}>More</span>
        </div>
      </div>
    </div>
  );
}
