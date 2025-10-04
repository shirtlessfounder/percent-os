import { Connection } from '@solana/web3.js';
import type { ProposalListResponse, ProposalListItem, ProposalDetailResponse, UserBalancesResponse } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';

class GovernanceAPI {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(RPC_URL);
  }

  async getProposals(): Promise<ProposalListItem[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/proposals`);
      if (!response.ok) throw new Error('Failed to fetch proposals');
      const data: ProposalListResponse = await response.json();
      return data.proposals;
    } catch (error) {
      console.error('Error fetching proposals:', error);
      return [];
    }
  }

  async getProposal(id: number): Promise<ProposalDetailResponse | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/proposals/${id}`);
      if (!response.ok) throw new Error('Failed to fetch proposal');
      return await response.json();
    } catch (error) {
      console.error('Error fetching proposal:', error);
      return null;
    }
  }

  async getUserBalances(proposalId: number, userAddress: string): Promise<UserBalancesResponse | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/vaults/${proposalId}/getUserBalances?user=${userAddress}`);
      if (!response.ok) throw new Error('Failed to fetch user balances');
      return await response.json();
    } catch (error) {
      console.error('Error fetching user balances:', error);
      return null;
    }
  }

  async getTWAP(proposalId: number): Promise<{ passTwap: number; failTwap: number } | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/history/${proposalId}/twap`);
      if (!response.ok) {
        throw new Error('Failed to fetch TWAP');
      }
      const data = await response.json();

      // Get the most recent TWAP data (first element, matching LivePriceDisplay)
      if (data.data && data.data.length > 0) {
        const latest = data.data[0];
        return {
          passTwap: parseFloat(latest.passTwap),
          failTwap: parseFloat(latest.failTwap)
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching TWAP:', error);
      return null;
    }
  }

  async getChartData(
    proposalId: number,
    interval: string,
    from?: Date,
    to?: Date
  ): Promise<any> {
    try {
      let url = `${API_BASE_URL}/api/history/${proposalId}/chart?interval=${interval}`;

      if (from) {
        url += `&from=${from.toISOString()}`;
      }
      if (to) {
        url += `&to=${to.toISOString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch chart data');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching chart data:', error);
      return null;
    }
  }

  async getSwapQuote(
    proposalId: number,
    market: 'pass' | 'fail',
    isBaseToQuote: boolean,
    amountIn: string,
    slippageBps: number = 2000
  ): Promise<{
    swapInAmount: string;
    consumedInAmount: string;
    swapOutAmount: string;
    minSwapOutAmount: string;
    totalFee: string;
    priceImpact: number;
    slippageBps: number;
    inputMint: string;
    outputMint: string;
  } | null> {
    try {
      const url = `${API_BASE_URL}/api/swap/${proposalId}/${market}/quote?isBaseToQuote=${isBaseToQuote}&amountIn=${amountIn}&slippageBps=${slippageBps}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch swap quote');
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching swap quote:', error);
      return null;
    }
  }
}

export const api = new GovernanceAPI();