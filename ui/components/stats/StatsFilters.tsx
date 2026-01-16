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

import { type Timeframe } from '@/app/stats/page';

interface StatsFiltersProps {
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
}

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: 'all', label: 'All' },
];

export default function StatsFilters({
  timeframe,
  onTimeframeChange,
}: StatsFiltersProps) {
  return (
    <div className="flex items-center gap-[2px] p-[4px] border border-[#191919] rounded-full">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.value}
          onClick={() => onTimeframeChange(tf.value)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition cursor-pointer font-ibm-plex-mono ${
            timeframe === tf.value
              ? 'bg-[#DDDDD7]'
              : 'bg-transparent'
          }`}
          style={timeframe === tf.value ? { color: '#161616' } : { color: '#6B6E71' }}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}
