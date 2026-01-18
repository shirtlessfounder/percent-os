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

import { Router } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { getPool } from '../../app/utils/database';
import { SolPriceService } from '../../app/services/sol-price.service';
import { ZcPriceService } from '../../app/services/zc-price.service';
import { POOL_METADATA } from '../config/pools';

const router = Router();

// Vault program ID (for staking data)
const PROGRAM_ID = new PublicKey("47rZ1jgK7zU6XAgffAfXkDX1JkiiRi4HRPBytossWR12");

// UserStake account discriminator
const USER_STAKE_DISCRIMINATOR = Buffer.from([102, 53, 163, 107, 9, 138, 87, 153]);
const USER_STAKE_OWNER_OFFSET = 8;
const USER_STAKE_SHARES_OFFSET = 40;
const USER_STAKE_UNBONDING_SHARES_OFFSET = 48;

// ZC total supply (1B tokens with 6 decimals)
const ZC_TOTAL_SUPPLY = 1_000_000_000;

// Cache for expensive on-chain queries (5 minute TTL)
let globalStatsCache: { data: any; timestamp: number } | null = null;
const GLOBAL_CACHE_TTL = 300000; // 5 minutes

// Cache for summary data (30 second TTL)
let summaryCache: { data: any; key: string; timestamp: number } | null = null;
const SUMMARY_CACHE_TTL = 30000; // 30 seconds

/**
 * GET /api/stats/projects
 * Returns list of integrated projects from POOL_METADATA
 */
router.get('/projects', async (_req, res) => {
  try {
    const projects = Object.values(POOL_METADATA)
      // Filter out test pools
      .filter(meta => !meta.ticker.toLowerCase().includes('test'))
      .map(meta => ({
        moderatorId: meta.moderatorId,
        name: meta.ticker.toUpperCase(),
        ticker: meta.ticker.toUpperCase(),
        icon: meta.icon,
        poolAddress: meta.poolAddress,
      }));

    res.json({ projects });
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/stats/summary?from=&to=&moderatorId=
 * Returns aggregate metrics for the dashboard
 */
router.get('/summary', async (req, res) => {
  try {
    const { from, to, moderatorId } = req.query;

    // Parse from date
    let fromDate: Date | undefined;
    if (from && typeof from === 'string') {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: 'Invalid from date format' });
      }
    }

    // Parse to date
    let toDate: Date | undefined;
    if (to && typeof to === 'string') {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ error: 'Invalid to date format' });
      }
    }

    // Parse moderatorId
    let modId: number | undefined;
    if (moderatorId && typeof moderatorId === 'string') {
      modId = parseInt(moderatorId);
      if (isNaN(modId)) {
        return res.status(400).json({ error: 'Invalid moderatorId' });
      }
    }

    // Check cache
    const cacheKey = `${fromDate?.toISOString() || 'all'}_${toDate?.toISOString() || 'now'}_${modId || 'all'}`;
    if (summaryCache && summaryCache.key === cacheKey && Date.now() - summaryCache.timestamp < SUMMARY_CACHE_TTL) {
      return res.json(summaryCache.data);
    }

    const pool = getPool();

    // Build base WHERE clause
    const conditions: string[] = [];
    const params: (Date | number)[] = [];
    let paramIndex = 1;

    if (fromDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(fromDate);
      paramIndex++;
    }

    if (toDate) {
      conditions.push(`created_at < $${paramIndex}`);
      params.push(toDate);
      paramIndex++;
    }

    if (modId !== undefined) {
      conditions.push(`moderator_id = $${paramIndex}`);
      params.push(modId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Get proposal counts
    const proposalsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        moderator_id,
        COUNT(*) as count
      FROM qm_proposals
      ${whereClause}
      GROUP BY moderator_id
    `, params);

    const proposals = {
      total: proposalsResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      byModerator: proposalsResult.rows.reduce((acc, r) => {
        acc[r.moderator_id] = parseInt(r.count);
        return acc;
      }, {} as Record<number, number>),
    };

    // 2. Get unique proposers - check if creator_wallet column exists
    let proposers = { total: 0, byModerator: {} as Record<number, number> };
    try {
      const proposersResult = await pool.query(`
        SELECT
          COUNT(DISTINCT creator_wallet) as total,
          moderator_id,
          COUNT(DISTINCT creator_wallet) as count
        FROM qm_proposals
        ${whereClause}
        GROUP BY moderator_id
      `, params);

      proposers = {
        total: proposersResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
        byModerator: proposersResult.rows.reduce((acc, r) => {
          acc[r.moderator_id] = parseInt(r.count);
          return acc;
        }, {} as Record<number, number>),
      };
    } catch {
      // creator_wallet column might not exist, use placeholder
      proposers = { total: 0, byModerator: {} };
    }

    // 3. Get trader counts and volume from trade history
    // Build trade history WHERE clause
    const tradeConditions: string[] = [];
    const tradeParams: (Date | number)[] = [];
    let tradeParamIndex = 1;

    if (fromDate) {
      tradeConditions.push(`timestamp >= $${tradeParamIndex}`);
      tradeParams.push(fromDate);
      tradeParamIndex++;
    }

    if (toDate) {
      tradeConditions.push(`timestamp < $${tradeParamIndex}`);
      tradeParams.push(toDate);
      tradeParamIndex++;
    }

    if (modId !== undefined) {
      tradeConditions.push(`moderator_id = $${tradeParamIndex}`);
      tradeParams.push(modId);
      tradeParamIndex++;
    }

    const tradeWhereClause = tradeConditions.length > 0 ? `WHERE ${tradeConditions.join(' AND ')}` : '';

    const tradersResult = await pool.query(`
      SELECT
        COUNT(DISTINCT user_address) as total,
        moderator_id,
        COUNT(DISTINCT user_address) as count
      FROM qm_trade_history
      ${tradeWhereClause}
      GROUP BY moderator_id
    `, tradeParams);

    const traders = {
      total: tradersResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      byModerator: tradersResult.rows.reduce((acc, r) => {
        acc[r.moderator_id] = parseInt(r.count);
        return acc;
      }, {} as Record<number, number>),
    };

    // 4. Get volume
    const volumeResult = await pool.query(`
      SELECT
        moderator_id,
        SUM(CASE WHEN is_base_to_quote THEN amount_in ELSE amount_out END) as base_volume,
        SUM(CASE WHEN is_base_to_quote THEN amount_out ELSE amount_in END) as quote_volume
      FROM qm_trade_history
      ${tradeWhereClause}
      GROUP BY moderator_id
    `, tradeParams);

    // Get prices
    const solPrice = await SolPriceService.getInstance().getSolPrice();
    const zcPrice = await ZcPriceService.getInstance().getZcPrice();

    let totalVolumeUsd = 0;
    const volumeByModerator: Record<number, number> = {};

    for (const row of volumeResult.rows) {
      const baseVolume = parseFloat(row.base_volume || '0');
      const quoteVolume = parseFloat(row.quote_volume || '0');
      const volumeUsd = (baseVolume * zcPrice) + (quoteVolume * solPrice);
      volumeByModerator[row.moderator_id] = volumeUsd;
      totalVolumeUsd += volumeUsd;
    }

    const volume = {
      totalUsd: totalVolumeUsd,
      byModerator: volumeByModerator,
    };

    // 5. Calculate averages
    const qmCount = proposals.total || 1;
    const averages = {
      volumePerQM: totalVolumeUsd / qmCount,
      tradersPerQM: traders.total / qmCount,
    };

    // 6. Get staker participation data
    const stakerData = await getStakerParticipation(tradeParams, tradeWhereClause, solPrice, zcPrice);

    // 7. Get global metrics (only when no moderator filter)
    let globalMetrics = undefined;
    if (modId === undefined) {
      // Count active projects: ZC, SURF (from POOL_METADATA) + Star (futarchy)
      // This doesn't need RPC, so compute it separately to ensure it always works
      const poolProjects = Object.values(POOL_METADATA)
        .filter(meta => meta.moderatorId === 2 || meta.moderatorId === 6)
        .length;
      const futarchyProjects = 1; // Star
      const integratedProjects = poolProjects + futarchyProjects;

      const stakingMetrics = await getStakingMetrics();
      globalMetrics = {
        integratedProjects,
        staking: stakingMetrics,
      };
    }

    const responseData = {
      proposals,
      proposers,
      traders,
      volume,
      averages,
      stakers: stakerData,
      global: globalMetrics,
    };

    // Update cache
    summaryCache = { data: responseData, key: cacheKey, timestamp: Date.now() };

    res.json(responseData);
  } catch (error) {
    console.error('Failed to fetch summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Zcombinator API for futarchy proposals
const ZCOMBINATOR_API_URL = process.env.ZCOMBINATOR_API_URL || 'https://api.zcombinator.io';

/**
 * GET /api/stats/contribution-grid?from=&moderatorId=
 * Returns QM creation frequency by date for GitHub-style heatmap
 * Combines old system (qm_proposals) and futarchy proposals
 */
router.get('/contribution-grid', async (req, res) => {
  try {
    const { from, moderatorId } = req.query;

    // Parse date
    let fromDate: Date | undefined;
    if (from && typeof from === 'string') {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: 'Invalid from date format' });
      }
    }

    // Parse moderatorId (only applies to old system)
    let modId: number | undefined;
    if (moderatorId && typeof moderatorId === 'string') {
      modId = parseInt(moderatorId);
      if (isNaN(modId)) {
        return res.status(400).json({ error: 'Invalid moderatorId' });
      }
    }

    // Count map to aggregate by date
    const countByDate: Record<string, number> = {};

    // 1. Fetch old system proposals from qm_proposals
    const pool = getPool();
    const conditions: string[] = [];
    const params: (Date | number)[] = [];
    let paramIndex = 1;

    if (fromDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(fromDate);
      paramIndex++;
    }

    if (modId !== undefined) {
      conditions.push(`moderator_id = $${paramIndex}`);
      params.push(modId);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const oldSystemResult = await pool.query(`
      SELECT
        TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') as date,
        COUNT(*) as count
      FROM qm_proposals
      ${whereClause}
      GROUP BY TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    `, params);

    for (const row of oldSystemResult.rows) {
      countByDate[row.date] = (countByDate[row.date] || 0) + parseInt(row.count);
    }

    // 2. Fetch futarchy proposals (only when no moderatorId filter)
    if (modId === undefined) {
      try {
        const futarchyResponse = await fetch(`${ZCOMBINATOR_API_URL}/dao/proposals/all`);
        if (futarchyResponse.ok) {
          const futarchyData = await futarchyResponse.json() as {
            proposals: Array<{ createdAt: number; daoPda?: string }>;
          };

          for (const proposal of futarchyData.proposals) {
            if (proposal.createdAt) {
              const proposalDate = new Date(proposal.createdAt);

              // Apply from date filter
              if (fromDate && proposalDate < fromDate) {
                continue;
              }

              const dateStr = proposalDate.toISOString().split('T')[0];
              countByDate[dateStr] = (countByDate[dateStr] || 0) + 1;
            }
          }
        }
      } catch (futarchyError) {
        console.warn('Failed to fetch futarchy proposals for contribution grid:', futarchyError);
        // Continue with old system data only
      }
    }

    // Convert to sorted array
    const data = Object.entries(countByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ data });
  } catch (error) {
    console.error('Failed to fetch contribution grid:', error);
    res.status(500).json({ error: 'Failed to fetch contribution grid' });
  }
});

/**
 * Helper: Get staker participation data
 */
async function getStakerParticipation(
  tradeParams: (Date | number)[],
  tradeWhereClause: string,
  solPrice: number,
  zcPrice: number
): Promise<{ volumeUsd: number; count: number; participatingCount: number }> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Get all staker addresses
    const userStakeAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(USER_STAKE_DISCRIMINATOR) } }
      ]
    });

    const stakerAddresses: string[] = [];
    for (const { account } of userStakeAccounts) {
      const owner = new PublicKey(account.data.slice(USER_STAKE_OWNER_OFFSET, USER_STAKE_OWNER_OFFSET + 32));
      const shares = account.data.readBigUInt64LE(USER_STAKE_SHARES_OFFSET);
      const unbondingShares = account.data.readBigUInt64LE(USER_STAKE_UNBONDING_SHARES_OFFSET);

      if (shares > 0n || unbondingShares > 0n) {
        stakerAddresses.push(owner.toBase58());
      }
    }

    if (stakerAddresses.length === 0) {
      return { volumeUsd: 0, count: 0, participatingCount: 0 };
    }

    // Build query for staker trades
    const pool = getPool();
    let query = `
      SELECT
        user_address,
        SUM(CASE WHEN is_base_to_quote THEN amount_in ELSE amount_out END) as base_volume,
        SUM(CASE WHEN is_base_to_quote THEN amount_out ELSE amount_in END) as quote_volume
      FROM qm_trade_history
      WHERE user_address = ANY($1)
    `;

    const queryParams: (string[] | Date | number)[] = [stakerAddresses];

    // Add time filter if present in tradeWhereClause
    if (tradeParams.length > 0 && tradeParams[0] instanceof Date) {
      query += ` AND timestamp >= $2`;
      queryParams.push(tradeParams[0]);
    }

    query += ` GROUP BY user_address`;

    const result = await pool.query(query, queryParams);

    let totalVolumeUsd = 0;
    let participatingCount = 0;

    for (const row of result.rows) {
      const baseVolume = parseFloat(row.base_volume || '0');
      const quoteVolume = parseFloat(row.quote_volume || '0');
      const volumeUsd = (baseVolume * zcPrice) + (quoteVolume * solPrice);
      totalVolumeUsd += volumeUsd;
      if (volumeUsd > 0) participatingCount++;
    }

    return {
      volumeUsd: totalVolumeUsd,
      count: stakerAddresses.length,
      participatingCount,
    };
  } catch (error) {
    console.error('Failed to fetch staker participation:', error);
    return { volumeUsd: 0, count: 0, participatingCount: 0 };
  }
}

/**
 * Helper: Get staking metrics (TVL, APY, etc.)
 */
async function getStakingMetrics(): Promise<{
  tvl: number;
  stakerCount: number;
  percentStaked: number;
  apy: number;
}> {
  try {
    // Check cache
    if (globalStatsCache && Date.now() - globalStatsCache.timestamp < GLOBAL_CACHE_TTL) {
      return globalStatsCache.data;
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Fetch VaultState for staking data
    const [vaultState] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_state")],
      PROGRAM_ID
    );
    const vaultStateAccount = await connection.getAccountInfo(vaultState);

    let tvl = 0;
    let apy = 0;

    if (vaultStateAccount) {
      // VaultState layout offsets
      const totalSharesOffset = 8 + 32 + 32 + 1 + 1 + 1; // 75
      const totalAssetsOffset = totalSharesOffset + 8; // 83
      const lastUpdateTsOffset = totalAssetsOffset + 8 + 8 + 8 + 8; // 115
      const streamEndTsOffset = lastUpdateTsOffset + 8 + 8; // 131
      const rewardRateOffset = streamEndTsOffset + 8; // 139

      const totalShares = Number(vaultStateAccount.data.readBigUInt64LE(totalSharesOffset));
      const totalAssets = Number(vaultStateAccount.data.readBigUInt64LE(totalAssetsOffset));
      const lastUpdateTs = Number(vaultStateAccount.data.readBigInt64LE(lastUpdateTsOffset));
      const streamEndTs = Number(vaultStateAccount.data.readBigInt64LE(streamEndTsOffset));
      const rewardRate = Number(vaultStateAccount.data.readBigUInt64LE(rewardRateOffset));

      // Calculate accrued rewards
      const now = Math.floor(Date.now() / 1000);
      const effectiveTime = Math.min(now, streamEndTs);
      const timeElapsed = Math.max(0, effectiveTime - lastUpdateTs);
      const accruedRewards = rewardRate * timeElapsed;

      // Live total assets
      const liveTotalAssets = totalAssets + accruedRewards;

      // TVL in ZC tokens (convert from lamports, ZC has 6 decimals)
      tvl = liveTotalAssets / 1e6;

      // APY calculation: rewardRate * SECONDS_PER_YEAR / totalAssets * 100
      const SECONDS_PER_YEAR = 31536000;
      if (liveTotalAssets > 0) {
        apy = (rewardRate * SECONDS_PER_YEAR / liveTotalAssets) * 100;
      }
    }

    // Get ZC price for USD TVL
    const zcPrice = await ZcPriceService.getInstance().getZcPrice();
    const tvlUsd = tvl * zcPrice;

    // Count stakers
    const userStakeAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58.encode(USER_STAKE_DISCRIMINATOR) } }
      ]
    });

    let stakerCount = 0;
    for (const { account } of userStakeAccounts) {
      const shares = account.data.readBigUInt64LE(USER_STAKE_SHARES_OFFSET);
      const unbondingShares = account.data.readBigUInt64LE(USER_STAKE_UNBONDING_SHARES_OFFSET);
      if (shares > 0n || unbondingShares > 0n) {
        stakerCount++;
      }
    }

    // Calculate percent staked
    const percentStaked = (tvl / ZC_TOTAL_SUPPLY) * 100;

    const data = {
      tvl: tvlUsd,
      stakerCount,
      percentStaked,
      apy,
    };

    // Update cache
    globalStatsCache = { data, timestamp: Date.now() };

    return data;
  } catch (error) {
    console.error('Failed to fetch staking metrics:', error);
    return { tvl: 0, stakerCount: 0, percentStaked: 0, apy: 0 };
  }
}

// === Buyback Data ===

// Fee wallet address (buyback source)
const FEE_WALLET = 'FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC';

// ZC mint address
const ZC_MINT = 'GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC';

// Buyback cache (5 minute TTL)
let buybackCache: { data: BuybackResponse; key: string; timestamp: number } | null = null;
const BUYBACK_CACHE_TTL = 300000; // 5 minutes

interface HeliusTokenTransfer {
  fromTokenAccount: string;
  toTokenAccount: string;
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
  tokenStandard: string;
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  tokenTransfers?: HeliusTokenTransfer[];
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      userAccount: string;
      tokenAccount: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      mint: string;
    }>;
  }>;
}

interface DailyBuyback {
  date: string;
  zcAmount: number;
  usdAmount: number;
}

interface BuybackResponse {
  dailyData: DailyBuyback[];
  totalZc: number;
  totalUsd: number;
}

/**
 * Fetch transactions from fee wallet using Helius API
 */
async function fetchFeeWalletTransactions(
  startTime: number,
  endTime: number
): Promise<HeliusTransaction[]> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    console.warn('[buybacks] HELIUS_API_KEY not configured');
    return [];
  }

  const allTxs: HeliusTransaction[] = [];
  let beforeSignature: string | undefined;
  let keepFetching = true;

  while (keepFetching) {
    const url = new URL(`https://api.helius.xyz/v0/addresses/${FEE_WALLET}/transactions`);
    url.searchParams.set('api-key', heliusApiKey);
    if (beforeSignature) {
      url.searchParams.set('before', beforeSignature);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status} ${response.statusText}`);
    }

    const transactions = await response.json() as HeliusTransaction[];

    if (transactions.length === 0) {
      break;
    }

    for (const tx of transactions) {
      const txTime = tx.timestamp * 1000;

      // Stop if we've gone past the start time
      if (txTime < startTime) {
        keepFetching = false;
        break;
      }

      // Include if within range
      if (txTime <= endTime) {
        allTxs.push(tx);
      }
    }

    // Set cursor for next page
    beforeSignature = transactions[transactions.length - 1].signature;

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  return allTxs;
}

/**
 * Detect buyback amounts from transactions
 * Buybacks = ZC purchases (ZC flowing INTO the fee wallet)
 */
function detectBuybacks(transactions: HeliusTransaction[]): Map<string, number> {
  const dailyBuybacks = new Map<string, number>();

  for (const tx of transactions) {
    const date = new Date(tx.timestamp * 1000).toISOString().split('T')[0];
    let zcAmount = 0;

    // Method 1: Check token transfers where fee wallet RECEIVES ZC
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint === ZC_MINT && transfer.toUserAccount === FEE_WALLET) {
          zcAmount += transfer.tokenAmount;
        }
      }
    }

    // Method 2: Check accountData for POSITIVE ZC balance changes (inflows)
    if (tx.accountData) {
      for (const account of tx.accountData) {
        if (account.account === FEE_WALLET && account.tokenBalanceChanges) {
          for (const change of account.tokenBalanceChanges) {
            if (change.mint === ZC_MINT) {
              const rawAmount = parseFloat(change.rawTokenAmount.tokenAmount);
              // Positive balance change = ZC received (buyback)
              if (rawAmount > 0) {
                zcAmount = Math.max(zcAmount, rawAmount / Math.pow(10, change.rawTokenAmount.decimals));
              }
            }
          }
        }
      }
    }

    if (zcAmount > 0) {
      dailyBuybacks.set(date, (dailyBuybacks.get(date) || 0) + zcAmount);
    }
  }

  return dailyBuybacks;
}

/**
 * GET /api/stats/buybacks?daysBack=31
 * Returns buyback data from fee wallet transactions
 */
router.get('/buybacks', async (req, res) => {
  try {
    const { daysBack: daysBackParam } = req.query;
    const daysBack = daysBackParam ? parseInt(daysBackParam as string) : 31;

    if (isNaN(daysBack) || daysBack < 1 || daysBack > 365) {
      return res.status(400).json({ error: 'Invalid daysBack parameter (1-365)' });
    }

    // Check cache
    const cacheKey = `buybacks-${daysBack}`;
    if (buybackCache && buybackCache.key === cacheKey && Date.now() - buybackCache.timestamp < BUYBACK_CACHE_TTL) {
      return res.json(buybackCache.data);
    }

    const endTime = Date.now();
    const startTime = endTime - daysBack * 24 * 60 * 60 * 1000;

    // Generate all dates in range
    const allDates: string[] = [];
    for (let d = new Date(startTime); d <= new Date(endTime); d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().split('T')[0]);
    }

    // Fetch transactions from Helius
    const transactions = await fetchFeeWalletTransactions(startTime, endTime);

    // Detect buybacks
    const dailyBuybacks = detectBuybacks(transactions);

    // Fetch ZC price
    const zcPrice = await ZcPriceService.getInstance().getZcPrice();

    // Calculate totals
    let totalZc = 0;
    for (const amount of dailyBuybacks.values()) {
      totalZc += amount;
    }

    // Build daily data with USD values
    const dailyData: DailyBuyback[] = allDates.map(date => {
      const zcAmount = dailyBuybacks.get(date) || 0;
      return {
        date,
        zcAmount,
        usdAmount: zcAmount * zcPrice,
      };
    });

    const totalUsd = totalZc * zcPrice;

    const responseData: BuybackResponse = {
      dailyData,
      totalZc,
      totalUsd,
    };

    // Update cache
    buybackCache = { data: responseData, key: cacheKey, timestamp: Date.now() };

    res.json(responseData);
  } catch (error) {
    console.error('Failed to fetch buyback data:', error);
    res.status(500).json({ error: 'Failed to fetch buyback data' });
  }
});

export default router;
