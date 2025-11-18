import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ProposalListItem, ProposalDetailResponse } from '@/types/api';

export function useProposals(poolAddress?: string, moderatorId?: number | string) {
  const [proposals, setProposals] = useState<ProposalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getProposals(poolAddress, moderatorId);

      // Server already filters by moderatorId, client-side filter only for legacy proposal exclusion
      const modId = moderatorId?.toString();
      const filteredData = modId === '2'
        ? data.filter(p => ![0, 1, 2, 6, 7].includes(p.id))
        : data;

      setProposals(filteredData);
      setError(null);
    } catch (err) {
      console.error('Error fetching proposals:', err);
      setError('Failed to fetch proposals');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [poolAddress, moderatorId]);

  useEffect(() => {
    // Only fetch if moderatorId is provided (not null or undefined) to avoid defaulting to moderator 1
    if (moderatorId != null) {
      fetchProposals();
    }
  }, [fetchProposals, moderatorId]);

  return { proposals, loading, error, refetch: fetchProposals };
}

export function useProposal(id: number, moderatorId?: number | string) {
  const [proposal, setProposal] = useState<ProposalDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProposal() {
      try {
        setLoading(true);
        const data = await api.getProposal(id, moderatorId);
        setProposal(data);
      } catch (err) {
        console.error('Error fetching proposal:', err);
        setError('Failed to fetch proposal');
        setProposal(null);
      } finally {
        setLoading(false);
      }
    }

    fetchProposal();
  }, [id, moderatorId]);

  return { proposal, loading, error };
}