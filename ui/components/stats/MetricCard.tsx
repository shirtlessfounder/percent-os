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

type MetricCardSize = 'small' | 'medium' | 'large' | 'wide';

interface MetricCardProps {
  label: string;
  value: string;
  loading?: boolean;
  highlight?: boolean;
  subValue?: string;
  comingSoon?: boolean;
  size?: MetricCardSize;
  headerStyle?: boolean;
}

const sizeStyles: Record<MetricCardSize, { padding: string; labelClass: string; valueClass: string; layout: string }> = {
  small: {
    padding: 'py-4 px-5',
    labelClass: 'text-xs mb-2',
    valueClass: 'text-xl font-semibold',
    layout: 'flex flex-col',
  },
  medium: {
    padding: 'py-4 px-5',
    labelClass: 'text-sm mb-2',
    valueClass: 'text-2xl font-semibold',
    layout: 'flex flex-col',
  },
  large: {
    padding: 'py-4 px-5',
    labelClass: 'text-sm mb-3',
    valueClass: 'text-3xl font-bold',
    layout: 'flex flex-col h-full justify-center',
  },
  wide: {
    padding: 'py-4 px-5',
    labelClass: 'text-sm',
    valueClass: 'text-2xl font-semibold',
    layout: 'flex items-center justify-between',
  },
};

export default function MetricCard({
  label,
  value,
  loading = false,
  highlight = false,
  subValue,
  comingSoon = false,
  size = 'small',
  headerStyle = false,
}: MetricCardProps) {
  const styles = sizeStyles[size];
  const isWide = size === 'wide';

  // Header style: label at top left with prominent styling, value centered below
  if (headerStyle) {
    return (
      <div
        className="rounded-[9px] border py-4 px-5 h-full flex flex-col"
        style={{
          backgroundColor: '#121212',
          borderColor: highlight ? '#39d353' : '#191919',
          opacity: comingSoon ? 0.6 : 1,
        }}
      >
        <span
          className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase"
          style={{ color: '#DDDDD7' }}
        >
          {label}
        </span>
        <div className="flex-1 flex items-center justify-center">
          {loading ? (
            <div className="h-10 rounded animate-pulse" style={{ backgroundColor: '#292929', width: '60px' }} />
          ) : (
            <span
              className="text-4xl font-semibold"
              style={{ color: comingSoon ? '#6B6E71' : highlight ? '#39d353' : '#DDDDD7' }}
            >
              {comingSoon ? '—' : value}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg border ${styles.padding} ${styles.layout} h-full`}
      style={{
        backgroundColor: '#121212',
        borderColor: highlight ? '#39d353' : '#191919',
        opacity: comingSoon ? 0.6 : 1,
      }}
    >
      {isWide ? (
        <>
          <p className={styles.labelClass} style={{ color: '#6B6E71' }}>
            {label}
          </p>
          {loading ? (
            <div className="h-8 rounded animate-pulse" style={{ backgroundColor: '#292929', width: '120px' }} />
          ) : (
            <div className="flex items-center gap-3">
              <p
                className={styles.valueClass}
                style={{ color: comingSoon ? '#6B6E71' : highlight ? '#39d353' : '#E9E9E3' }}
              >
                {comingSoon ? '—' : value}
              </p>
              {(subValue || comingSoon) && (
                <p className="text-xs" style={{ color: '#6B6E71' }}>
                  {comingSoon ? 'Coming soon' : subValue}
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className={styles.labelClass} style={{ color: '#6B6E71' }}>
            {label}
          </p>
          {loading ? (
            <div className="h-7 rounded animate-pulse" style={{ backgroundColor: '#292929', width: '60%' }} />
          ) : (
            <>
              <p
                className={styles.valueClass}
                style={{ color: comingSoon ? '#6B6E71' : highlight ? '#39d353' : '#E9E9E3' }}
              >
                {comingSoon ? '—' : value}
              </p>
              {(subValue || comingSoon) && (
                <p className="text-xs mt-1" style={{ color: '#6B6E71' }}>
                  {comingSoon ? 'Coming soon' : subValue}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
