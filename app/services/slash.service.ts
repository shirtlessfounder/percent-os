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

import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { getPool } from '../utils/database';
import { LoggerService } from './logger.service';
import { initStakingVaultService, StakingVaultService } from './staking-vault.service';

// Staking vault constants
const STAKING_PROGRAM_ID = new PublicKey("47rZ1jgK7zU6XAgffAfXkDX1JkiiRi4HRPBytossWR12");

const logger = new LoggerService('slash-service');

// Initialize Solana connection
const rpcUrl = process.env.HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(rpcUrl, 'confirmed');

// Initialize staking vault service for slash execution
let stakingVaultService: StakingVaultService | null = null;
try {
  stakingVaultService = initStakingVaultService(connection);
  if (stakingVaultService) {
    logger.info('StakingVaultService initialized for slash execution');
  }
} catch (error) {
  logger.warn('Failed to initialize StakingVaultService', {
    error: error instanceof Error ? error.message : String(error)
  });
}

/**
 * Records a slash if the finalized proposal is a slash proposal with a winning outcome other than "No"
 * Called automatically during proposal finalization
 */
export async function recordSlashIfApplicable(
  moderatorId: number,
  proposalId: number,
  proposal: { config: { title: string; market_labels?: string[] }; getStatus: () => { winningMarketIndex?: number | null; winningMarketLabel?: string | null } }
): Promise<void> {
  const title = proposal.config.title;

  // Check if this is a slash proposal (contains "slash" and a Solana address)
  if (!title.toLowerCase().includes('slash')) {
    return; // Not a slash proposal
  }

  // Extract Solana wallet address (32-44 base58 characters)
  const walletMatch = title.match(/([A-Za-z0-9]{32,44})/);
  if (!walletMatch) {
    logger.info('[recordSlash] Slash keyword found but no wallet address in title', { proposalId, title });
    return;
  }

  const targetWallet = walletMatch[1];
  const statusInfo = proposal.getStatus();

  // Get the winning market label
  const winningLabel = statusInfo.winningMarketLabel;
  if (!winningLabel) {
    logger.info('[recordSlash] No winning label found', { proposalId, moderatorId });
    return;
  }

  // Check if the winning outcome is "No" - if so, no slash occurs
  if (winningLabel.toLowerCase() === 'no') {
    logger.info('[recordSlash] Slash proposal resolved to No - no slash recorded', {
      proposalId,
      moderatorId,
      targetWallet
    });
    return;
  }

  // Parse the slash percentage from the winning label (e.g., "20%", "40%", "60%", "80%", "100%")
  const percentMatch = winningLabel.match(/(\d+)%/);
  if (!percentMatch) {
    logger.warn('[recordSlash] Could not parse percentage from winning label', {
      proposalId,
      winningLabel
    });
    return;
  }

  const slashPercentage = parseInt(percentMatch[1]);

  // Query the user's shares from on-chain UserStake account
  let sharesToSlash = 0n;
  let totalUserShares = 0n;
  let txSignature: string | null = null;
  let zcAmountSlashed = 0;

  if (stakingVaultService) {
    try {
      // Get user's total shares (active + unbonding)
      totalUserShares = await stakingVaultService.getUserShares(targetWallet);

      if (totalUserShares > 0n) {
        // Calculate shares to slash based on percentage
        sharesToSlash = (totalUserShares * BigInt(slashPercentage)) / 100n;

        if (sharesToSlash > 0n) {
          // Execute on-chain slash
          logger.info('[recordSlash] Executing on-chain slash', {
            targetWallet,
            totalUserShares: totalUserShares.toString(),
            sharesToSlash: sharesToSlash.toString(),
            slashPercentage
          });

          txSignature = await stakingVaultService.slash(targetWallet, sharesToSlash);

          logger.info('[recordSlash] On-chain slash executed successfully', {
            targetWallet,
            sharesToSlash: sharesToSlash.toString(),
            txSignature
          });
        }
      } else {
        logger.info('[recordSlash] User has no shares to slash', { targetWallet });
      }
    } catch (error) {
      logger.error('[recordSlash] Failed to execute on-chain slash', {
        targetWallet,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue to record in database even if on-chain slash fails
    }
  } else {
    logger.warn('[recordSlash] StakingVaultService not available - recording without on-chain execution');
  }

  // Also calculate ZC amount for display purposes (using sZC token balance as before)
  try {
    // Derive share mint PDA
    const [shareMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("share_mint")],
      STAKING_PROGRAM_ID
    );

    // Find user's sZC token account (query both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID)
    const filters = [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: shareMint.toBase58() } },
      { memcmp: { offset: 32, bytes: targetWallet } }
    ];
    const [tokenAccounts, token2022Accounts] = await Promise.all([
      connection.getProgramAccounts(TOKEN_PROGRAM_ID, { filters }),
      connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, { filters })
    ]);
    const allTokenAccounts = [...tokenAccounts, ...token2022Accounts];

    if (allTokenAccounts.length > 0) {
      // Parse the token account balance
      const accountData = allTokenAccounts[0].account.data;
      const rawBalance = accountData.readBigUInt64LE(64);
      const stakedBalance = Number(rawBalance) / 1_000_000; // sZC has 6 decimals

      // Calculate slashed amount
      zcAmountSlashed = stakedBalance * (slashPercentage / 100);
    }
  } catch (error) {
    logger.warn('[recordSlash] Failed to fetch sZC balance for display', {
      targetWallet,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Insert into qm_slashed table
  const pool = getPool();
  await pool.query(
    `INSERT INTO qm_slashed (moderator_id, proposal_id, target_wallet, slash_percentage, zc_amount_slashed, shares_slashed, tx_signature)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [moderatorId, proposalId, targetWallet, slashPercentage, zcAmountSlashed, sharesToSlash.toString(), txSignature]
  );

  logger.info('[recordSlash] Slash recorded successfully', {
    moderatorId,
    proposalId,
    targetWallet,
    slashPercentage,
    zcAmountSlashed,
    sharesToSlash: sharesToSlash.toString(),
    txSignature
  });
}
