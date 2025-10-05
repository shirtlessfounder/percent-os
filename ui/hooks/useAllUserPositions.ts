import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useProposals } from './useProposals';
import { useTokenPrices } from './useTokenPrices';
import type { UserBalancesResponse, ProposalListItem } from '@/types/api';

export interface UserPosition {
  proposalId: number;
  proposalDescription: string;
  proposalStatus: string;
  positionType: 'pass' | 'fail';
  passAmount: number;
  failAmount: number;
  value: number; // USD value
}

interface AllUserPositions {
  positions: UserPosition[];
  totalValue: number;
  loading: boolean;
  error: string | null;
}

export function useAllUserPositions(walletAddress: string | null): AllUserPositions {
  const { proposals } = useProposals();
  const { sol: solPrice, zc: zcPrice } = useTokenPrices();
  const [balancesMap, setBalancesMap] = useState<Map<number, UserBalancesResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllBalances = useCallback(async (address: string, proposalList: ProposalListItem[]) => {
    if (proposalList.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch balances for all proposals in parallel
      const balancePromises = proposalList.map(proposal =>
        api.getUserBalances(proposal.id, address)
          .then(data => ({ id: proposal.id, data }))
          .catch(() => ({ id: proposal.id, data: null }))
      );

      const results = await Promise.all(balancePromises);

      // Update the balances map
      const newMap = new Map<number, UserBalancesResponse>();
      results.forEach(({ id, data }) => {
        if (data) {
          newMap.set(id, data);
        }
      });

      setBalancesMap(newMap);
    } catch (err) {
      console.error('Error fetching all user balances:', err);
      setError('Failed to fetch user positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!walletAddress || proposals.length === 0) {
      setBalancesMap(new Map());
      return;
    }

    fetchAllBalances(walletAddress, proposals);
  }, [walletAddress, proposals, fetchAllBalances]);

  // Calculate positions from balances
  const { positions, totalValue } = useMemo(() => {
    const positionsList: UserPosition[] = [];
    let total = 0;

    balancesMap.forEach((balances, proposalId) => {
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) return;

      const basePassConditional = parseFloat(balances.base.passConditional || '0');
      const baseFailConditional = parseFloat(balances.base.failConditional || '0');
      const quotePassConditional = parseFloat(balances.quote.passConditional || '0');
      const quoteFailConditional = parseFloat(balances.quote.failConditional || '0');

      // Check if user has a position
      const hasPassPosition = basePassConditional > 0 && quoteFailConditional > 0;
      const hasFailPosition = quotePassConditional > 0 && baseFailConditional > 0;

      if (hasPassPosition || hasFailPosition) {
        const positionType = hasPassPosition ? 'pass' : 'fail';

        let passAmount, failAmount, value;

        if (hasPassPosition) {
          // Pass position: gets ZC if pass, SOL if fail
          passAmount = basePassConditional;  // in ZC raw units
          failAmount = quoteFailConditional; // in SOL raw units

          // Calculate USD value based on position type
          // For pending proposals, use the higher of the two potential payouts
          if (proposal.status === 'Pending') {
            const passValue = (passAmount / 1e6) * zcPrice;  // ZC with 6 decimals
            const failValue = (failAmount / 1e9) * solPrice;     // SOL with 9 decimals
            value = Math.max(passValue, failValue);
          } else if (proposal.status === 'Passed') {
            value = (passAmount / 1e6) * zcPrice;
          } else {
            value = (failAmount / 1e9) * solPrice;
          }
        } else {
          // Fail position: gets SOL if pass, ZC if fail
          passAmount = quotePassConditional; // in SOL raw units
          failAmount = baseFailConditional;  // in ZC raw units

          if (proposal.status === 'Pending') {
            const passValue = (passAmount / 1e9) * solPrice;     // SOL with 9 decimals
            const failValue = (failAmount / 1e6) * zcPrice;  // ZC with 6 decimals
            value = Math.max(passValue, failValue);
          } else if (proposal.status === 'Passed') {
            value = (passAmount / 1e9) * solPrice;
          } else {
            value = (failAmount / 1e6) * zcPrice;
          }
        }

        positionsList.push({
          proposalId,
          proposalDescription: proposal.description,
          proposalStatus: proposal.status,
          positionType,
          passAmount,
          failAmount,
          value
        });

        total += value;
      }
    });

    return { positions: positionsList, totalValue: total };
  }, [balancesMap, proposals, solPrice, zcPrice]);

  return { positions, totalValue, loading, error };
}