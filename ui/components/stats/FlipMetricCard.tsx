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

interface FlipMetricCardProps {
  label: string;
  value: number;
  loading?: boolean;
  prefix?: string; // e.g., "$"
  decimals?: number; // number of decimal places (default 2)
  minDigits?: number; // minimum digits for small values (default 4)
  percentChange?: number; // percentage change from last period (e.g., 12.5 for +12.5%)
  timeframe?: '1d' | '1w' | '1m' | 'all'; // timeframe filter to display
  subtitle?: string; // optional subtitle text below the digits
}

function MiniFlipDigit({ digit }: { digit: string }) {
  return (
    <div className="flip-digit-mini-container">
      <div className="flip-digit-mini-upper">
        <span className="flip-digit-mini-text">{digit}</span>
      </div>
      <div className="flip-digit-mini-lower">
        <span className="flip-digit-mini-text">{digit}</span>
      </div>
    </div>
  );
}

interface FormatOptions {
  prefix?: string;
  decimals?: number;
  minDigits?: number;
}

/**
 * Formats a number into flip card characters
 * Supports configurable decimals and minimum digit padding
 */
function formatValueToDigits(value: number, options: FormatOptions = {}): string[] {
  const { prefix, decimals = 2, minDigits = 4 } = options;

  let suffix: string | null = null;
  let scaledValue = value;

  if (value >= 1e9) {
    scaledValue = value / 1e9;
    suffix = 'B';
  } else if (value >= 1e6) {
    scaledValue = value / 1e6;
    suffix = 'M';
  } else if (value >= 1e4) {
    scaledValue = value / 1e3;
    suffix = 'K';
  }

  // Format to specified decimal places
  const formatted = scaledValue.toFixed(decimals);
  const [wholePart, decimalPart] = formatted.split('.');

  const digits: string[] = [];

  // Add prefix if provided
  if (prefix) {
    digits.push(prefix);
  }

  // For small values, pad to minDigits; otherwise dynamic
  const displayWhole = !suffix ? wholePart.padStart(minDigits, '0') : wholePart;

  // Add whole part digits
  for (const char of displayWhole) {
    digits.push(char);
  }

  // Add decimal point and decimal digits if decimals > 0
  if (decimals > 0 && decimalPart) {
    digits.push('.');
    for (const char of decimalPart) {
      digits.push(char);
    }
  }

  // Add suffix only if K/M/B
  if (suffix) {
    digits.push(suffix);
  }

  return digits;
}

export default function FlipMetricCard({
  label,
  value,
  loading = false,
  prefix,
  decimals = 2,
  minDigits = 4,
  percentChange,
  timeframe,
  subtitle,
}: FlipMetricCardProps) {
  const digits = formatValueToDigits(value, { prefix, decimals, minDigits });

  const formatPercentChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  const formatTimeframe = (tf: string) => {
    return `(${tf.toUpperCase()})`;
  };

  return (
    <div
      className="rounded-[9px] border py-4 px-5 flex flex-col"
      style={{
        backgroundColor: '#121212',
        borderColor: '#191919',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase"
          style={{ color: '#DDDDD7' }}
        >
          {label}
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
      <div className="flex flex-col items-center justify-center pt-6 pb-3">
        {loading ? (
          <div className="h-14 rounded animate-pulse" style={{ backgroundColor: '#292929', width: '340px' }} />
        ) : (
          <>
            <div className="flex items-center gap-1">
              {digits.map((digit, index) => (
                <MiniFlipDigit key={index} digit={digit} />
              ))}
            </div>
            {subtitle && (
              <span className="text-xs font-ibm-plex-mono mt-2" style={{ color: '#DDDDD7' }}>
                {subtitle}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
