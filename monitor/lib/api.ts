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

export const getApiUrl = () => process.env.ZCOMBINATOR_API_URL || 'https://api.zcombinator.io';

// ============================================================================
// Types
// ============================================================================

export interface ApiProposal {
  id: number;
  proposalPda: string;
  title: string;
  description: string;
  options: string[];
  status: 'Setup' | 'Pending' | 'Passed' | 'Failed'; // Vibe slopped status from api
  createdAt: number;
  endsAt: number | null;
  finalizedAt: number | null;
  metadataCid: string | null;
  daoPda: string;
  daoName: string;
  tokenMint: string;
  tokenIcon: string | null;
}

export interface AllProposalsResponse {
  proposals: ApiProposal[];
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Call the Combinator API.
 * - GET request if no body provided
 * - POST request if body provided
 */
export async function callApi<T = unknown>(
  endpoint: string,
  body?: Record<string, string>
): Promise<T> {
  const res = await fetch(`${getApiUrl()}${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  });

  const data = (await res.json()) as { error?: string; [key: string]: unknown };

  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return data as T;
}
