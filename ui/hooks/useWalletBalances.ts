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

import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import { isNativeSol, TOKEN_MINTS } from '@/lib/constants/tokens';
import { getTokenProgramForMint } from '@/lib/programs/utils';

interface WalletBalancesState {
  sol: number; // Quote token balance (SOL, USDC, etc.) - named 'sol' for backward compatibility
  baseToken: number; // Base token balance (ZC, OOGWAY, etc.)
  loading: boolean;
  error: string | null;
}

interface WalletBalances extends WalletBalancesState {
  refetch: () => void;
}

interface UseWalletBalancesParams {
  walletAddress: string | null;
  baseMint?: string | null; // Base token mint address
  baseDecimals: number;
  quoteMint?: string | null; // Quote token mint (SOL, USDC, etc.)
  quoteDecimals: number; // Quote token decimals
}

export function useWalletBalances({
  walletAddress,
  baseMint,
  baseDecimals,
  quoteMint,
  quoteDecimals,
}: UseWalletBalancesParams): WalletBalances {
  const [balances, setBalances] = useState<WalletBalancesState>({
    sol: 0,
    baseToken: 0,
    loading: false,
    error: null,
  });

  // Determine if quote is native SOL - requires quoteMint to be known
  const isQuoteNativeSol = quoteMint ? isNativeSol(quoteMint) : false;

  const fetchBalances = useCallback(async (address: string) => {
    setBalances(prev => ({ ...prev, loading: true, error: null }));

    try {
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const pubKey = new PublicKey(address);

      // Fetch quote token balance (SOL or other token like USDC)
      let quoteAmount = 0;
      if (isQuoteNativeSol) {
        // Native SOL balance
        const solBalance = await connection.getBalance(pubKey);
        quoteAmount = solBalance / LAMPORTS_PER_SOL;
      } else if (quoteMint) {
        // SPL token balance (USDC, etc.)
        try {
          const tokenMint = new PublicKey(quoteMint);
          const programId = await getTokenProgramForMint(tokenMint);
          const tokenATA = await getAssociatedTokenAddress(tokenMint, pubKey, false, programId);
          const tokenAccount = await getAccount(connection, tokenATA, 'confirmed', programId);
          quoteAmount = Number(tokenAccount.amount) / Math.pow(10, quoteDecimals);
        } catch {
          // Token account might not exist if user has 0 balance - this is normal
        }
      }

      // Fetch base token balance (if baseMint provided)
      let baseTokenAmount = 0;
      if (baseMint) {
        try {
          const tokenMint = new PublicKey(baseMint);
          const programId = await getTokenProgramForMint(tokenMint);
          const tokenATA = await getAssociatedTokenAddress(tokenMint, pubKey, false, programId);
          const tokenAccount = await getAccount(connection, tokenATA, 'confirmed', programId);
          // Use dynamic decimals
          baseTokenAmount = Number(tokenAccount.amount) / Math.pow(10, baseDecimals);
        } catch {
          // Token account might not exist if user has 0 balance - this is normal
        }
      }

      setBalances({
        sol: quoteAmount, // Named 'sol' for backward compatibility but holds quote token balance
        baseToken: baseTokenAmount,
        loading: false,
        error: null,
      });
    } catch (error) {
      setBalances({
        sol: 0,
        baseToken: 0,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balances',
      });
    }
  }, [baseMint, baseDecimals, quoteMint, quoteDecimals, isQuoteNativeSol]);

  useEffect(() => {
    if (!walletAddress) {
      setBalances({
        sol: 0,
        baseToken: 0,
        loading: false,
        error: null,
      });
      return;
    }

    // Initial fetch
    fetchBalances(walletAddress);

    // Set up WebSocket subscriptions for real-time updates
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const pubKey = new PublicKey(walletAddress);

    // Subscribe to account changes for quote token balance
    // For native SOL, subscribe to the wallet account; for SPL tokens, subscribe to the ATA
    let quoteSubscriptionId: number | null = null;
    const isQuoteSol = quoteMint ? isNativeSol(quoteMint) : false;

    if (isQuoteSol) {
      // Subscribe to wallet account for SOL balance changes
      quoteSubscriptionId = connection.onAccountChange(
        pubKey,
        () => fetchBalances(walletAddress),
        'confirmed'
      );
    } else if (quoteMint) {
      // Subscribe to quote token ATA for SPL token balance changes
      (async () => {
        try {
          const tokenMint = new PublicKey(quoteMint);
          const programId = await getTokenProgramForMint(tokenMint);
          const tokenATA = await getAssociatedTokenAddress(tokenMint, pubKey, false, programId);
          quoteSubscriptionId = connection.onAccountChange(
            tokenATA,
            () => fetchBalances(walletAddress),
            'confirmed'
          );
        } catch {
          // Could not subscribe - normal if account doesn't exist
        }
      })();
    }

    // Subscribe to base token account changes (if baseMint provided)
    let baseTokenSubscriptionId: number | null = null;
    if (baseMint) {
      (async () => {
        try {
          const tokenMint = new PublicKey(baseMint);
          const programId = await getTokenProgramForMint(tokenMint);
          const tokenATA = await getAssociatedTokenAddress(tokenMint, pubKey, false, programId);
          baseTokenSubscriptionId = connection.onAccountChange(
            tokenATA,
            () => fetchBalances(walletAddress),
            'confirmed'
          );
        } catch {
          // Could not subscribe to token account changes - this is normal if account doesn't exist
        }
      })();
    }

    // Also refresh every 30 seconds as fallback
    const interval = setInterval(() => fetchBalances(walletAddress), 30000);

    // Cleanup
    return () => {
      if (quoteSubscriptionId !== null) {
        connection.removeAccountChangeListener(quoteSubscriptionId);
      }
      if (baseTokenSubscriptionId !== null) {
        connection.removeAccountChangeListener(baseTokenSubscriptionId);
      }
      clearInterval(interval);
    };
  }, [walletAddress, baseMint, quoteMint, fetchBalances]);

  // Create a stable refetch function
  const refetch = useCallback(() => {
    if (walletAddress) {
      fetchBalances(walletAddress);
    }
  }, [walletAddress, fetchBalances]);

  return { ...balances, refetch };
}
