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

/**
 * Proposal Market Overrides
 *
 * Some proposals were created with incorrect market counts that need to be
 * corrected in the UI. This module provides utilities to filter out extra
 * markets for specific proposals.
 *
 * Structure: { moderatorId: { proposalId: maxMarkets } }
 */
export const PROPOSAL_MARKET_OVERRIDES: Record<string, Record<number, number>> = {
  // Proposal 25 on ZC (moderatorId 2) was created with 3 markets by mistake
  // We need to filter it to only show 2 markets (indices 0 and 1)
  '2': { 25: 2 },
};

/**
 * Market Label Overrides
 *
 * Override display labels for specific markets on specific proposals.
 * Useful when a proposal was created with a default label that needs
 * a more descriptive display name.
 *
 * Structure: { moderatorId: { proposalId: { marketIndex: newLabel } } }
 */
export const MARKET_LABEL_OVERRIDES: Record<string, Record<number, Record<number, string>>> = {
  // Proposal 9 on SURF (moderatorId 6): Override "No" to show full description
  '6': { 9: { 0: '0% - Full growth reinvestment (default)' } },
};

/**
 * Get the effective market count for a proposal, applying any overrides
 */
export function getEffectiveMarketCount(
  moderatorId: number | string | null | undefined,
  proposalId: number,
  actualMarketCount: number
): number {
  const modIdStr = moderatorId?.toString();
  if (!modIdStr) return actualMarketCount;

  const overrides = PROPOSAL_MARKET_OVERRIDES[modIdStr];
  if (overrides && overrides[proposalId] !== undefined) {
    return Math.min(actualMarketCount, overrides[proposalId]);
  }
  return actualMarketCount;
}

/**
 * Filter an array of market data to the effective market count
 */
export function filterMarketData<T>(
  data: T[],
  moderatorId: number | string | null | undefined,
  proposalId: number
): T[] {
  const effectiveCount = getEffectiveMarketCount(moderatorId, proposalId, data.length);
  return data.slice(0, effectiveCount);
}

/**
 * Apply label overrides to market labels for a specific proposal
 */
export function applyMarketLabelOverrides(
  labels: string[],
  moderatorId: number | string | null | undefined,
  proposalId: number
): string[] {
  const modIdStr = moderatorId?.toString();
  if (!modIdStr) return labels;

  const modOverrides = MARKET_LABEL_OVERRIDES[modIdStr];
  if (!modOverrides) return labels;

  const proposalOverrides = modOverrides[proposalId];
  if (!proposalOverrides) return labels;

  return labels.map((label, index) => proposalOverrides[index] ?? label);
}

/**
 * Get the overridden label for a single market index, or return the original label
 */
export function getOverriddenLabel(
  originalLabel: string | null | undefined,
  moderatorId: number | string | null | undefined,
  proposalId: number,
  marketIndex: number | null | undefined
): string | null | undefined {
  if (!originalLabel || marketIndex === null || marketIndex === undefined) return originalLabel;

  const modIdStr = moderatorId?.toString();
  if (!modIdStr) return originalLabel;

  const modOverrides = MARKET_LABEL_OVERRIDES[modIdStr];
  if (!modOverrides) return originalLabel;

  const proposalOverrides = modOverrides[proposalId];
  if (!proposalOverrides) return originalLabel;

  return proposalOverrides[marketIndex] ?? originalLabel;
}
