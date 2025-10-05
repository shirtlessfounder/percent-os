import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useProposals } from './useProposals';
import { useTokenPrices } from './useTokenPrices';
import type { UserBalancesResponse, ProposalListItem } from '@/types/api';

export interface ClaimablePosition {
  proposalId: number;
  proposalDescription: string;
  proposalStatus: 'Passed' | 'Failed';
  positionType: 'pass' | 'fail';
  isWinner: boolean;
  claimableAmount: number; // Amount of tokens to claim
  claimableToken: 'sol' | 'zc'; // Which token they'll receive
  claimableValue: number; // USD value
}

interface ClaimablePositions {
  positions: ClaimablePosition[];
  totalClaimableValue: number;
  loading: boolean;
  error: string | null;
}

export function useClaimablePositions(walletAddress: string | null): ClaimablePositions {
  const { proposals } = useProposals();
  const { sol: solPrice, zc: zcPrice } = useTokenPrices();
  const [balancesMap, setBalancesMap] = useState<Map<number, UserBalancesResponse>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllBalances = useCallback(async (address: string, proposalList: ProposalListItem[]) => {
    // Only fetch for finalized proposals
    const finalizedProposals = proposalList.filter(p =>
      p.status === 'Passed' || p.status === 'Failed'
    );

    if (finalizedProposals.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch balances for finalized proposals in parallel
      const balancePromises = finalizedProposals.map(proposal =>
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
      console.error('Error fetching claimable balances:', err);
      setError('Failed to fetch claimable positions');
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

  // Calculate claimable positions from balances
  const { positions, totalClaimableValue } = useMemo(() => {
    const claimableList: ClaimablePosition[] = [];
    let total = 0;

    balancesMap.forEach((balances, proposalId) => {
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal || (proposal.status !== 'Passed' && proposal.status !== 'Failed')) return;

      const basePassConditional = parseFloat(balances.base.passConditional || '0');
      const baseFailConditional = parseFloat(balances.base.failConditional || '0');
      const quotePassConditional = parseFloat(balances.quote.passConditional || '0');
      const quoteFailConditional = parseFloat(balances.quote.failConditional || '0');

      // Determine if user has winning tokens to claim
      const proposalPassed = proposal.status === 'Passed';

      // For base vault (ZC):
      // - If proposal passed, pass conditional tokens win (can redeem for ZC)
      // - If proposal failed, fail conditional tokens win (can redeem for ZC)
      const baseWinningTokens = proposalPassed ? basePassConditional : baseFailConditional;

      // For quote vault (SOL):
      // - If proposal passed, pass conditional tokens win (can redeem for SOL)
      // - If proposal failed, fail conditional tokens win (can redeem for SOL)
      const quoteWinningTokens = proposalPassed ? quotePassConditional : quoteFailConditional;

      // Check if user has any winning tokens to claim
      if (baseWinningTokens > 0 || quoteWinningTokens > 0) {
        // Determine user's original position type based on their balances
        const hasPassPosition = basePassConditional > 0 && quoteFailConditional > 0;
        const hasFailPosition = quotePassConditional > 0 && baseFailConditional > 0;

        if (!hasPassPosition && !hasFailPosition) {
          // User might have partial positions or already claimed some
          // Check if they have any winning tokens
          if (baseWinningTokens > 0) {
            // Can claim ZC
            const value = (baseWinningTokens / 1e6) * zcPrice;
            claimableList.push({
              proposalId,
              proposalDescription: proposal.description,
              proposalStatus: proposal.status as 'Passed' | 'Failed',
              positionType: proposalPassed ? 'pass' : 'fail',
              isWinner: true,
              claimableAmount: baseWinningTokens / 1e6,
              claimableToken: 'zc',
              claimableValue: value
            });
            total += value;
          }

          if (quoteWinningTokens > 0) {
            // Can claim SOL
            const value = (quoteWinningTokens / 1e9) * solPrice;
            claimableList.push({
              proposalId,
              proposalDescription: proposal.description,
              proposalStatus: proposal.status as 'Passed' | 'Failed',
              positionType: proposalPassed ? 'pass' : 'fail',
              isWinner: true,
              claimableAmount: quoteWinningTokens / 1e9,
              claimableToken: 'sol',
              claimableValue: value
            });
            total += value;
          }
        } else {
          // User has a clear position type
          const positionType = hasPassPosition ? 'pass' : 'fail';
          const isWinner = (positionType === 'pass' && proposalPassed) ||
                          (positionType === 'fail' && !proposalPassed);

          if (isWinner) {
            // Winner gets their collateral back
            let claimableAmount: number;
            let claimableToken: 'sol' | 'zc';
            let value: number;

            if (positionType === 'pass') {
              // Pass position wins if proposal passed - gets ZC back
              claimableAmount = basePassConditional / 1e6;
              claimableToken = 'zc';
              value = claimableAmount * zcPrice;
            } else {
              // Fail position wins if proposal failed - gets ZC back
              claimableAmount = baseFailConditional / 1e6;
              claimableToken = 'zc';
              value = claimableAmount * zcPrice;
            }

            claimableList.push({
              proposalId,
              proposalDescription: proposal.description,
              proposalStatus: proposal.status as 'Passed' | 'Failed',
              positionType,
              isWinner,
              claimableAmount,
              claimableToken,
              claimableValue: value
            });
            total += value;
          }
        }
      }
    });

    return { positions: claimableList, totalClaimableValue: total };
  }, [balancesMap, proposals, solPrice, zcPrice]);

  return { positions, totalClaimableValue, loading, error };
}