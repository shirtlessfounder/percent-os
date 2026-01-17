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

import FlipDigit from './FlipDigit';

interface TotalQMsCardProps {
  value: number;
  loading?: boolean;
  timeframe?: '1d' | '1w' | '1m' | 'all';
  percentChange?: number;
}

export default function TotalQMsCard({ value, loading = false, timeframe, percentChange }: TotalQMsCardProps) {
  // Get last 2 digits, padded
  const digits = value.toString().padStart(2, '0').slice(-2).split('');

  const formatPercentChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    const formatted = Number.isInteger(change) ? change.toString() : change.toFixed(1);
    return `${sign}${formatted}%`;
  };

  return (
    <div
      className="rounded-[9px] border py-4 px-5 h-full flex flex-col"
      style={{
        backgroundColor: '#121212',
        borderColor: '#191919',
      }}
    >
      {/* Flip Digits */}
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <div className="h-[154px] w-56 rounded animate-pulse bg-[#292929]" />
        ) : (
          <div className="flex items-center gap-2">
            {digits.map((digit, index) => (
              <FlipDigit key={index} digit={digit} />
            ))}
          </div>
        )}
      </div>

      {/* Title and Percent Change */}
      <div className="flex items-center justify-between mt-7">
        <span
          className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase"
          style={{ color: '#DDDDD7' }}
        >
          Futarchies
        </span>
        {percentChange !== undefined && (
          <span
            className="text-xs font-ibm-plex-mono"
            style={{ color: percentChange > 0 ? '#BEE8FC' : '#6B6E71' }}
          >
            {formatPercentChange(percentChange)}
          </span>
        )}
      </div>
    </div>
  );
}
