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

interface Project {
  moderatorId: number;
  name: string;
  ticker: string;
  logo?: string;
}

interface ActiveProjectsCardProps {
  count: number;
  projects: Project[];
  loading?: boolean;
  timeframe?: '1d' | '1w' | '1m' | 'all';
  percentChange?: number;
}

export default function ActiveProjectsCard({
  count,
  projects,
  loading = false,
  timeframe,
  percentChange,
}: ActiveProjectsCardProps) {
  const formatPercentChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  };

  return (
    <div
      className="rounded-[9px] border py-4 px-5 h-full flex flex-col"
      style={{
        backgroundColor: '#121212',
        borderColor: '#191919',
      }}
    >
      {/* Title and Percent Change - Top */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase"
          style={{ color: '#DDDDD7' }}
        >
          Active Projects
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

      {/* Grid Area with inner border */}
      <div className="flex-1 flex items-center justify-center">
        {loading ? (
          <div className="border border-[#191919] rounded-lg p-4 w-full h-full">
            <div className="w-full h-full rounded animate-pulse bg-[#292929]" />
          </div>
        ) : (
          <div className="border border-[#191919] rounded-lg p-4 w-full h-full flex flex-col justify-center overflow-hidden">
            {projects.length > 0 ? (
              <>
                <div className="grid gap-3 justify-center content-center flex-1"
                  style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(64px, max-content))`,
                  }}
                >
                  {projects.map((project) => (
                    <div
                      key={project.moderatorId}
                      className="w-16 h-16 rounded-lg flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: '#292929' }}
                      title={`${project.name} (${project.ticker})`}
                    >
                      {project.logo ? (
                        <img
                          src={project.logo}
                          alt={project.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span
                          className="text-xl font-bold"
                          style={{ color: '#DDDDD7' }}
                        >
                          {project.ticker?.charAt(0) || project.name?.charAt(0) || '?'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs font-ibm-plex-mono text-center mt-4" style={{ color: '#6B6E71' }}>
                  $2.4M TVL Secured  ·  $18M MCap Secured  ·  $12K Rev Generated
                </p>
              </>
            ) : (
              // Show diagonal stripe pattern when no projects
              <div
                className="w-full h-full rounded"
                style={{
                  backgroundImage: `repeating-linear-gradient(
                    -45deg,
                    transparent,
                    transparent 12px,
                    #191919 12px,
                    #191919 14px
                  )`,
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
