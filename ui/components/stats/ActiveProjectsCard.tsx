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

import { useState, useEffect, useCallback } from 'react';
import { formatUSD } from '@/lib/formatters';

interface Project {
  moderatorId: number;
  name: string;
  ticker: string;
  logo?: string;
  baseMint?: string;
}

interface ActiveProjectsCardProps {
  count: number;
  projects: Project[];
  loading?: boolean;
  timeframe?: '1d' | '1w' | '1m' | 'all';
  percentChange?: number;
  combinedMcapUsd?: number;
  mcapLoading?: boolean;
  combinedTvlUsd?: number;
  tvlLoading?: boolean;
  // Per-project data maps (keyed by project name lowercase)
  projectTvlMap?: Map<string, number>;
  projectMcapMap?: Map<string, number>;
  className?: string;
}

export default function ActiveProjectsCard({
  count,
  projects,
  loading = false,
  timeframe,
  percentChange,
  combinedMcapUsd,
  mcapLoading = false,
  combinedTvlUsd,
  tvlLoading = false,
  projectTvlMap,
  projectMcapMap,
  className,
}: ActiveProjectsCardProps) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Get metrics for the selected project or combined if none selected
  const getDisplayMetrics = () => {
    if (selectedProject) {
      const key = selectedProject.name.toLowerCase();
      const tvl = projectTvlMap?.get(key) ?? 0;
      const mcap = projectMcapMap?.get(key) ?? 0;
      return { tvl, mcap, isIndividual: true };
    }
    return { tvl: combinedTvlUsd ?? 0, mcap: combinedMcapUsd ?? 0, isIndividual: false };
  };

  const { tvl: displayTvl, mcap: displayMcap, isIndividual } = getDisplayMetrics();

  const formatPercentChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    const formatted = Number.isInteger(change) ? change.toString() : change.toFixed(1);
    return `${sign}${formatted}%`;
  };

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSelectedProject(null);
    }
  }, []);

  useEffect(() => {
    if (selectedProject) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [selectedProject, handleEscape]);

  return (
    <div
      className={`rounded-[9px] border py-4 px-5 h-full flex flex-col ${className || ''}`}
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
      <div className="flex-1 flex">
        {loading ? (
          <div className="border border-[#191919] rounded-lg p-4 w-full flex-1">
            <div className="w-full h-full rounded animate-pulse bg-[#292929]" />
          </div>
        ) : (
          <div className="border border-[#191919] rounded-lg p-4 w-full flex-1 flex flex-col justify-center overflow-hidden">
            {selectedProject ? (
              // Show enlarged selected project
              <>
                <div
                  className="flex items-center justify-center flex-1 cursor-pointer"
                  onClick={() => setSelectedProject(null)}
                >
                  <div
                    className="w-32 h-32 rounded-lg flex items-center justify-center overflow-hidden"
                    style={{ backgroundColor: '#292929' }}
                  >
                    {selectedProject.logo ? (
                      <img
                        src={selectedProject.logo}
                        alt={selectedProject.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span
                        className="text-4xl font-bold"
                        style={{ color: '#DDDDD7' }}
                      >
                        {selectedProject.ticker?.charAt(0) || selectedProject.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs font-ibm-plex-mono text-center mt-4" style={{ color: '#6B6E71' }}>
                  {tvlLoading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : displayTvl > 0 ? (
                    `${formatUSD(displayTvl, 1)} TVL Secured`
                  ) : (
                    '$0 TVL Secured'
                  )}  ·  {mcapLoading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : displayMcap > 0 ? (
                    `${formatUSD(displayMcap, 1)} MCap`
                  ) : (
                    '$0 MCap'
                  )}
                </p>
              </>
            ) : projects.length > 0 ? (
              <>
                <div className="grid gap-3 justify-center content-center flex-1 py-12 md:py-0"
                  style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(64px, max-content))`,
                  }}
                >
                  {projects.map((project) => (
                    <div
                      key={project.moderatorId}
                      className="w-16 h-16 rounded-lg flex items-center justify-center overflow-hidden cursor-pointer transition-transform hover:scale-105"
                      style={{ backgroundColor: '#292929' }}
                      title={`${project.name} (${project.ticker})`}
                      onClick={() => setSelectedProject(project)}
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
                  {tvlLoading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : displayTvl > 0 ? (
                    `${formatUSD(displayTvl, 1)} TVL Secured`
                  ) : (
                    '$0 TVL Secured'
                  )}  ·  {mcapLoading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : displayMcap > 0 ? (
                    `${formatUSD(displayMcap, 1)} ${isIndividual ? 'MCap' : 'Combined MCap'}`
                  ) : (
                    `$0 ${isIndividual ? 'MCap' : 'Combined MCap'}`
                  )}
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
