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

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { fetchUserBalances } from '@/lib/programs/vault';
import type { UserBalancesResponse } from '@/lib/programs/vault';

interface UserBalances {
  data: UserBalancesResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useUserBalances(
  proposalId: number | null,
  vaultPDA: string | null,
  walletAddress: string | null
): UserBalances {
  const [balances, setBalances] = useState<Omit<UserBalances, 'refetch'>>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchBalances = useCallback(async (
    id: number,
    vaultPDAStr: string,
    address: string
  ) => {
    setBalances(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await fetchUserBalances(
        new PublicKey(vaultPDAStr),
        new PublicKey(address),
        id
      );

      setBalances({
        data,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error fetching user balances:', error);
      setBalances({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch user balances',
      });
    }
  }, []);

  useEffect(() => {
    // Only fetch if all required params are available
    if (proposalId === null || !vaultPDA || !walletAddress) {
      setBalances({
        data: null,
        loading: false,
        error: null,
      });
      return;
    }

    // Initial fetch
    fetchBalances(proposalId, vaultPDA, walletAddress);

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchBalances(proposalId, vaultPDA, walletAddress);
    }, 30000);

    // Cleanup
    return () => {
      clearInterval(interval);
    };
  }, [proposalId, vaultPDA, walletAddress, fetchBalances]);

  const refetch = useCallback(() => {
    if (proposalId !== null && vaultPDA && walletAddress) {
      fetchBalances(proposalId, vaultPDA, walletAddress);
    }
  }, [proposalId, vaultPDA, walletAddress, fetchBalances]);

  return {
    ...balances,
    refetch,
  };
}
