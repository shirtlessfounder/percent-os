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

import { PublicKey, Transaction } from '@solana/web3.js';
import toast from 'react-hot-toast';
import { buildApiUrl } from './api-utils';
import { fetchUserBalanceForWinningMint as fetchUserBalanceOld, redeemWinnings as redeemWinningsOld, VaultType } from './programs/vault';
import { fetchUserBalanceForWinningMint as fetchUserBalanceFutarchy, redeemWinnings as redeemWinningsFutarchy, executeSwapWithSlippage } from './programs/futarchy';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface OpenPositionConfig {
  proposalId: number;
  market: number;  // Which AMM market to trade on (0-3 for quantum markets)
  inputToken: 'quote' | 'base';  // Which conditional token we're selling
  inputAmount: string;  // Amount of conditional tokens to sell
  userAddress: string;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  baseDecimals: number;  // Required - decimals for the base token
  quoteDecimals: number; // Required - decimals for the quote token
  tokenSymbol: string;  // Display symbol for the base token (e.g., 'ZC')
  quoteSymbol: string;  // Display symbol for the quote token (e.g., 'SOL', 'USDC')
  moderatorId?: number;  // Moderator ID for multi-moderator support
  // Futarchy-specific fields (new system)
  isFutarchy?: boolean;  // Whether this is a futarchy proposal
  poolPDA?: string;  // Pool PDA for futarchy swaps (from proposal.pools[market])
}

/**
 * Execute a swap on a specific market (Pass or Fail AMM)
 * Swaps conditional tokens: e.g., Pass-ZC → Pass-SOL or Fail-SOL → Fail-ZC
 */
export async function openPosition(config: OpenPositionConfig): Promise<void> {
  const { proposalId, market, inputToken, inputAmount, userAddress, signTransaction, baseDecimals, quoteDecimals, tokenSymbol, quoteSymbol, moderatorId, isFutarchy, poolPDA } = config;

  // Determine swap direction based on inputToken and system type
  // Futarchy pools: mintA = quote, mintB = base
  // Old system pools: mintA = base, mintB = quote
  const swapAToB = isFutarchy
    ? inputToken === 'quote'      // Futarchy: selling quote (A) → swapAToB = true
    : inputToken === 'base';      // Old: selling base (A) → swapAToB = true

  const toastId = toast.loading(`Swapping ${market}-${inputToken.toUpperCase()}...`);

  try {
    // Convert decimal amount to smallest units using dynamic decimals
    const decimals = inputToken === 'base' ? baseDecimals : quoteDecimals;
    const amountInSmallestUnits = Math.floor(parseFloat(inputAmount) * Math.pow(10, decimals)).toString();

    if (isFutarchy && poolPDA) {
      // Futarchy: use SDK directly
      await executeFutarchySwap(
        poolPDA,
        swapAToB,
        amountInSmallestUnits,
        userAddress,
        signTransaction
      );
    } else {
      // Old system: use API
      await executeMarketSwap(
        proposalId,
        market,
        swapAToB,
        amountInSmallestUnits,
        userAddress,
        signTransaction,
        moderatorId
      );
    }

    // Success message
    const inputSymbol = inputToken === 'base' ? tokenSymbol : quoteSymbol;
    const outputSymbol = inputToken === 'base' ? quoteSymbol : tokenSymbol;
    toast.success(
      `Successfully swapped ${inputSymbol} → ${outputSymbol}!`,
      { id: toastId, duration: 5000 }
    );

  } catch (error) {
    console.error('Error executing swap:', error);
    toast.error(
      `Failed to execute swap: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { id: toastId }
    );
    throw error;
  }
}

/**
 * Claim winnings from a finished proposal
 * Claims from BOTH vaults (base and quote) for the winning market
 * For N-ary quantum markets (2-4 options)
 */
export async function claimWinnings(config: {
  proposalId: number;
  winningMarketIndex: number;  // Which market won (from proposal.winningMarketIndex)
  vaultPDA: string;
  userAddress: string;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  isFutarchy?: boolean;  // Whether this is a futarchy proposal
}): Promise<void> {
  const { proposalId, winningMarketIndex, vaultPDA, userAddress, signTransaction, isFutarchy = false } = config;

  const toastId = toast.loading('Claiming winnings from both vaults...');

  try {
    // Use appropriate SDK based on system
    const fetchBalanceFn = isFutarchy ? fetchUserBalanceFutarchy : fetchUserBalanceOld;
    const redeemFn = isFutarchy ? redeemWinningsFutarchy : redeemWinningsOld;

    // Get user balances for the winning market only
    // Uses Promise.allSettled internally to gracefully handle network errors
    const winningBalances = await fetchBalanceFn(
      new PublicKey(vaultPDA),
      new PublicKey(userAddress),
      winningMarketIndex
    );

    // Check if user has winning tokens
    const hasBaseTokens = parseFloat(winningBalances.baseConditionalBalance) > 0;
    const hasQuoteTokens = parseFloat(winningBalances.quoteConditionalBalance) > 0;

    const vaultTypesToRedeem: VaultType[] = [];
    if (hasBaseTokens) vaultTypesToRedeem.push(VaultType.Base);
    if (hasQuoteTokens) vaultTypesToRedeem.push(VaultType.Quote);

    if (vaultTypesToRedeem.length === 0) {
      throw new Error('No winning tokens to claim');
    }

    // Redeem from each vault type that has tokens using appropriate SDK
    for (const vaultType of vaultTypesToRedeem) {
      await redeemFn(
        new PublicKey(vaultPDA),
        vaultType,
        new PublicKey(userAddress),
        signTransaction
      );
    }

    toast.success(
      `Winnings claimed successfully from ${vaultTypesToRedeem.length} vault${vaultTypesToRedeem.length > 1 ? 's' : ''}!`,
      { id: toastId, duration: 5000 }
    );

    return;

  } catch (error) {
    console.error('Error claiming winnings:', error);
    toast.error(
      `Failed to claim winnings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { id: toastId }
    );
    throw error;
  }
}

/**
 * Execute a swap on a futarchy AMM pool using the SDK directly
 */
async function executeFutarchySwap(
  poolPDA: string,
  swapAToB: boolean,  // A = base conditional, B = quote conditional (SOL)
  amountIn: string,
  userAddress: string,
  signTransaction: (transaction: Transaction) => Promise<Transaction>
): Promise<void> {
  // Default to 20% slippage for large swaps (2000 bps)
  const slippageBps = 2000;

  await executeSwapWithSlippage(
    new PublicKey(poolPDA),
    swapAToB,
    amountIn,
    slippageBps,
    new PublicKey(userAddress),
    signTransaction
  );
}

/**
 * Execute a swap on a specific market (0-3 for quantum markets) via API (old system)
 */
async function executeMarketSwap(
  proposalId: number,
  market: number,  // Numeric market index (0-3)
  isBaseToQuote: boolean,
  amountIn: string,
  userAddress: string,
  signTransaction: (transaction: Transaction) => Promise<Transaction>,
  moderatorId?: number
): Promise<void> {

  // Build swap request (market is already numeric)
  const swapRequest = {
    user: userAddress,
    market: market,
    isBaseToQuote: isBaseToQuote,
    amountIn: amountIn,
    slippageBps: 2000 // 20% slippage for large swaps
  };

  const buildSwapResponse = await fetch(buildApiUrl(API_BASE_URL, `/api/swap/${proposalId}/buildSwapTx`, undefined, moderatorId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(swapRequest)
  });

  if (!buildSwapResponse.ok) {
    const error = await buildSwapResponse.json();
    throw new Error(`Build ${market} swap failed: ${error.message || JSON.stringify(error)}`);
  }

  const swapTxData = await buildSwapResponse.json();

  // Sign the swap transaction
  const swapTx = Transaction.from(Buffer.from(swapTxData.transaction, 'base64'));
  const signedSwapTx = await signTransaction(swapTx);

  // Execute the signed swap transaction
  const executeSwapResponse = await fetch(buildApiUrl(API_BASE_URL, `/api/swap/${proposalId}/executeSwapTx`, undefined, moderatorId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transaction: Buffer.from(signedSwapTx.serialize({ requireAllSignatures: false })).toString('base64'),
      market: market,
      user: userAddress,
      isBaseToQuote: isBaseToQuote,
      amountIn: amountIn,
      amountOut: swapTxData.expectedAmountOut
    })
  });
  
  if (!executeSwapResponse.ok) {
    const error = await executeSwapResponse.json();
    throw new Error(`${market} swap execution failed: ${error.message || JSON.stringify(error)}`);
  }
}