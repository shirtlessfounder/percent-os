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

import { EventEmitter } from 'events';
import { Connection, PublicKey, Keypair, Logs } from '@solana/web3.js';
import { AnchorProvider, Wallet, BorshCoder, EventParser, BN } from '@coral-xyz/anchor';
import {
  FutarchyClient,
  FUTARCHY_PROGRAM_ID,
  PoolType,
  AMM_PROGRAM_ID,
} from '@zcomb/programs-sdk';

// Local event types with snake_case fields (matches raw Anchor event parsing)
interface ProposalLaunchedEvent {
  proposal_id: number;
  proposal: PublicKey;
  num_options: number;
  base_amount: BN;
  quote_amount: BN;
  created_at: BN;
}

interface ProposalFinalizedEvent {
  proposal_id: number;
  proposal: PublicKey;
  winning_idx: number;
}

interface CondSwapEvent {
  pool: PublicKey;
  trader: PublicKey;
  swap_a_to_b: boolean;
  input_amount: BN;
  output_amount: BN;
  fee_amount: BN;
}
import { FutarchyIDL, AmmIDL } from '@zcomb/programs-sdk/dist/generated/idls';
import { getPool } from '@app/utils/database';
import { logError } from './lib/logger';
import { callApi, ApiProposal, AllProposalsResponse } from './lib/api';

export interface MonitoredProposal {
  // Proposal
  proposalPda: string;
  proposalId: number;
  numOptions: number;
  pools: string[]; // Conditional market pools
  endTime: number;
  createdAt: number;

  // Moderator
  moderatorPda: string;
  name: string;
  baseMint: string;
  quoteMint: string;

  // DAO (optional)
  daoPda?: string;
  spotPool?: string;
  spotPoolType?: PoolType;
}

export interface SwapEvent {
  proposalPda: string;
  pool: string;
  market: number; // Pool index (0, 1, etc)
  trader: string;
  swapAToB: boolean;
  amountIn: BN;
  amountOut: BN;
  feeAmount: BN;
  txSignature: string;
}

export interface MonitorEvents {
  'proposal:added': (proposal: MonitoredProposal) => void;
  'proposal:removed': (proposal: MonitoredProposal) => void;
  'swap': (swap: SwapEvent) => void;
}

/**
 * Listens for ProposalLaunched/ProposalFinalized events on-chain and tracks
 * proposals from moderators registered in our database (cmb_daos table).
 * Emits 'proposal:added' and 'proposal:removed' events for other services.
 */
export class Monitor extends EventEmitter {
  readonly monitored = new Map<string, MonitoredProposal>();
  readonly client: FutarchyClient;

  private connection: Connection;
  private futarchyParser: EventParser;
  private ammParser: EventParser;
  private futarchySubId: number | null = null;
  private ammSubId: number | null = null;

  // pool address -> proposal PDA (for fast swap lookups)
  private poolToProposal = new Map<string, string>();

  constructor(rpcUrl: string) {
    super();
    this.connection = new Connection(rpcUrl, 'confirmed');
    const wallet = new Wallet(Keypair.generate());
    const provider = new AnchorProvider(this.connection, wallet, { commitment: 'confirmed' });

    this.client = new FutarchyClient(provider);
    this.futarchyParser = new EventParser(FUTARCHY_PROGRAM_ID, new BorshCoder(FutarchyIDL as any));
    this.ammParser = new EventParser(AMM_PROGRAM_ID, new BorshCoder(AmmIDL as any));
  }

  async start() {
    // Listen for Futarchy events (ProposalLaunched, ProposalFinalized)
    this.futarchySubId = this.connection.onLogs(
      FUTARCHY_PROGRAM_ID,
      (logs) => this.handleFutarchyLogs(logs),
      'confirmed'
    );
    console.log(`[Monitor] Listening for Futarchy events on ${FUTARCHY_PROGRAM_ID.toBase58()}`);

    // Listen for AMM events (CondSwap)
    this.ammSubId = this.connection.onLogs(
      AMM_PROGRAM_ID,
      (logs) => this.handleAmmLogs(logs),
      'confirmed'
    );
    console.log(`[Monitor] Listening for AMM events on ${AMM_PROGRAM_ID.toBase58()}`);
  }

  /**
   * Load all pending proposals from the external API on startup.
   * Fetches on-chain data to build complete MonitoredProposal objects.
   */
  async loadPendingProposals(): Promise<void> {
    console.log('[Monitor] Loading pending proposals from API...');

    // 1. Fetch all proposals from API
    let apiProposals: ApiProposal[];
    try {
      const response = await callApi<AllProposalsResponse>('/dao/proposals/all');
      apiProposals = response.proposals;
    } catch (error) {
      console.error('[Monitor] Failed to fetch proposals from API:', error);
      logError('server', { type: 'load_pending_proposals', error: String(error) });
      return;
    }

    // 2. Filter for 'Pending' status only
    const pendingProposals = apiProposals.filter((p) => p.status === 'Pending');
    console.log(`[Monitor] Found ${pendingProposals.length} pending proposals to load`);

    if (pendingProposals.length === 0) return;

    // 3. Load all proposals in parallel
    const results = await Promise.all(
      pendingProposals.map(async (apiProposal) => {
        try {
          await this.loadProposalFromApi(apiProposal);
          return { pda: apiProposal.proposalPda, success: true };
        } catch (error) {
          const errMsg = String(error);
          console.error(`[Monitor] Failed to load proposal ${apiProposal.proposalPda}:`, errMsg);
          logError('server', {
            type: 'load_proposal_failed',
            proposalPda: apiProposal.proposalPda,
            daoName: apiProposal.daoName,
            error: errMsg,
          });
          return { pda: apiProposal.proposalPda, success: false };
        }
      })
    );

    const loaded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`[Monitor] Loaded ${loaded} proposals, ${failed} failed`);
  }

  /**
   * Load a single proposal from API data by fetching on-chain state.
   */
  private async loadProposalFromApi(apiProposal: ApiProposal): Promise<void> {
    const proposalPda = new PublicKey(apiProposal.proposalPda);
    const proposalPdaStr = apiProposal.proposalPda;

    // Skip if already monitored
    if (this.monitored.has(proposalPdaStr)) {
      console.log(`[Monitor] Proposal ${proposalPdaStr} already monitored, skipping`);
      return;
    }

    // Fetch on-chain proposal data
    const proposal = await this.client.fetchProposal(proposalPda);
    const moderatorPdaStr = proposal.moderator.toBase58();

    // Check if moderator is tracked in our database
    if (!(await this.isTrackedModerator(moderatorPdaStr))) {
      console.log(`[Monitor] Ignoring proposal ${proposalPdaStr} - moderator not tracked`);
      return;
    }

    // Fetch moderator for mints
    const moderator = await this.client.fetchModerator(proposal.moderator);
    const name = moderator.name;
    const baseMint = moderator.baseMint.toBase58();
    const quoteMint = moderator.quoteMint.toBase58();

    // Try to fetch DAO for spot pool (optional)
    const [daoPda] = this.client.deriveDAOPDA(name);
    let daoInfo: { daoPda: string; spotPool: string; spotPoolType: PoolType } | undefined;

    try {
      const dao = await this.client.fetchDAO(daoPda);

      // Child DAOs are not supported
      if (!('parent' in dao.daoType) || !dao.daoType.parent) {
        console.log(`[Monitor] DAO ${name} is a child DAO - skipping spot pool info`);
      } else {
        const { moderator: daoModerator, pool, poolType } = dao.daoType.parent;

        // Moderator mismatch check
        if (daoModerator.toBase58() !== moderatorPdaStr) {
          logError('server', {
            type: 'load_proposal_moderator_mismatch',
            name,
            proposalPda: proposalPdaStr,
            error: `Moderator mismatch: DAO has ${daoModerator.toBase58()}, proposal has ${moderatorPdaStr}`,
          });
          return;
        }

        daoInfo = {
          daoPda: daoPda.toBase58(),
          spotPool: pool.toBase58(),
          spotPoolType: poolType,
        };
      }
    } catch {
      // DAO doesn't exist - continue without spot pool
      console.log(`[Monitor] DAO ${name} not found - continuing without spot pool info`);
    }

    // Calculate timing
    const createdAtMs = apiProposal.createdAt;
    const timeRemaining = this.client.getTimeRemaining(proposal);
    const endTime = Date.now() + timeRemaining * 1000;

    // Filter out uninitialized pool slots
    const pools = proposal.pools
      .map((p: PublicKey) => p.toBase58())
      .filter((p: string) => p !== '11111111111111111111111111111111');

    const info: MonitoredProposal = {
      proposalPda: proposalPdaStr,
      proposalId: proposal.id,
      numOptions: proposal.numOptions,
      pools,
      endTime,
      createdAt: createdAtMs,
      moderatorPda: moderatorPdaStr,
      name,
      baseMint,
      quoteMint,
      ...daoInfo,
    };

    this.monitored.set(proposalPdaStr, info);

    // Track pools for swap event filtering
    for (const pool of pools) {
      this.poolToProposal.set(pool, proposalPdaStr);
    }

    this.emit('proposal:added', info);
    console.log(`[Monitor] Loaded proposal ${proposalPdaStr} [${name}] (ends: ${new Date(endTime).toISOString()})`);
  }

  async stop() {
    if (this.futarchySubId !== null) {
      await this.connection.removeOnLogsListener(this.futarchySubId);
      this.futarchySubId = null;
    }
    if (this.ammSubId !== null) {
      await this.connection.removeOnLogsListener(this.ammSubId);
      this.ammSubId = null;
    }
    console.log('[Monitor] Stopped event listeners');
  }

  private handleFutarchyLogs(logs: Logs) {
    if (logs.err) return;

    try {
      const events = this.futarchyParser.parseLogs(logs.logs);
      for (const event of events) {
        if (event.name === 'ProposalLaunched') {
          this.handleProposalLaunched(event.data as ProposalLaunchedEvent);
        } else if (event.name === 'ProposalFinalized') {
          this.handleProposalFinalized(event.data as ProposalFinalizedEvent);
        }
      }
    } catch {
      // Parsing can fail for non-event logs
    }
  }

  private handleAmmLogs(logs: Logs) {
    if (logs.err) return;

    try {
      const events = this.ammParser.parseLogs(logs.logs);
      for (const event of events) {
        if (event.name === 'CondSwap') {
          this.handleCondSwap(event.data as CondSwapEvent, logs.signature);
        }
      }
    } catch {
      // Parsing can fail for non-event logs
    }
  }

  private handleCondSwap(data: CondSwapEvent, txSignature: string) {
    console.log('[Monitor] CondSwap event:', JSON.stringify({
      pool: data.pool.toBase58(),
      trader: data.trader.toBase58(),
      swap_a_to_b: data.swap_a_to_b,
      input_amount: data.input_amount.toString(),
      output_amount: data.output_amount.toString(),
      fee_amount: data.fee_amount.toString(),
    }, null, 2));

    const poolStr = data.pool.toBase58();
    const proposalPda = this.poolToProposal.get(poolStr);

    // Ignore swaps from pools we're not tracking
    if (!proposalPda) return;

    const proposal = this.monitored.get(proposalPda);
    if (!proposal) return;

    // Find market index (which pool in the proposal)
    const market = proposal.pools.indexOf(poolStr);

    const swap: SwapEvent = {
      proposalPda,
      pool: poolStr,
      market,
      trader: data.trader.toBase58(),
      swapAToB: data.swap_a_to_b,
      amountIn: data.input_amount,
      amountOut: data.output_amount,
      feeAmount: data.fee_amount,
      txSignature,
    };

    this.emit('swap', swap);
    console.log(`[Monitor] Swap on ${proposal.name} pool ${market}: ${swap.trader.slice(0, 8)}...`);
  }

  private async isTrackedModerator(moderatorPda: string): Promise<boolean> {
    const result = await getPool().query(
      'SELECT 1 FROM cmb_daos WHERE moderator_pda = $1 LIMIT 1',
      [moderatorPda]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async handleProposalLaunched(data: ProposalLaunchedEvent) {
    console.log('[Monitor] ProposalLaunched event:', JSON.stringify({
      proposal_id: data.proposal_id,
      proposal: data.proposal.toBase58(),
      num_options: data.num_options,
      base_amount: data.base_amount.toString(),
      quote_amount: data.quote_amount.toString(),
      created_at: data.created_at.toString(),
    }, null, 2));

    const proposalPdaStr = data.proposal.toBase58();

    try {
      // Fetch proposal account
      const proposal = await this.client.fetchProposal(data.proposal);
      const moderatorPdaStr = proposal.moderator.toBase58();

      // Check if moderator is tracked in our database
      if (!(await this.isTrackedModerator(moderatorPdaStr))) {
        console.log(`Ignoring proposal ${proposalPdaStr} - moderator not tracked`);
        return;
      }

      // Fetch moderator account to get name and mints
      const moderator = await this.client.fetchModerator(proposal.moderator);
      const name = moderator.name;
      const baseMint = moderator.baseMint.toBase58();
      const quoteMint = moderator.quoteMint.toBase58();

      // Try to fetch DAO account (may not exist)
      const [daoPda] = this.client.deriveDAOPDA(name);
      let daoInfo: { daoPda: string; spotPool: string; spotPoolType: PoolType } | undefined;

      try {
        const dao = await this.client.fetchDAO(daoPda);

        // Child DAOs are not supported
        if (!('parent' in dao.daoType) || !dao.daoType.parent) {
          logError('server', {
            type: 'proposal_launched_handler',
            name,
            proposalPda: proposalPdaStr,
            error: `DAO is a child DAO - not supported`,
          });
          return;
        }

        const { moderator: daoModerator, pool, poolType } = dao.daoType.parent;

        // Moderator mismatch is a critical error
        if (daoModerator.toBase58() !== moderatorPdaStr) {
          logError('server', {
            type: 'proposal_launched_handler',
            name,
            proposalPda: proposalPdaStr,
            error: `Moderator mismatch: DAO has ${daoModerator.toBase58()}, proposal has ${moderatorPdaStr}`,
          });
          return;
        }

        daoInfo = {
          daoPda: daoPda.toBase58(),
          spotPool: pool.toBase58(),
          spotPoolType: poolType,
        };
      } catch {
        // DAO doesn't exist yet - continue without spot pool info
        console.log(`DAO ${name} not found - continuing without spot pool info`);
      }

      // Calculate timing
      const createdAtMs = Number(data.created_at) * 1000;
      const timeRemaining = this.client.getTimeRemaining(proposal);
      const endTime = Date.now() + timeRemaining * 1000;

      // Filter out uninitialized pool slots
      const pools = proposal.pools
        .map((p: PublicKey) => p.toBase58())
        .filter((p: string) => p !== '11111111111111111111111111111111');

      const info: MonitoredProposal = {
        // Proposal
        proposalPda: proposalPdaStr,
        proposalId: data.proposal_id,
        numOptions: data.num_options,
        pools,
        endTime,
        createdAt: createdAtMs,

        // Moderator
        moderatorPda: moderatorPdaStr,
        name,
        baseMint,
        quoteMint,

        // DAO (optional)
        ...daoInfo,
      };

      this.monitored.set(proposalPdaStr, info);

      // Track pools for swap event filtering
      for (const pool of pools) {
        this.poolToProposal.set(pool, proposalPdaStr);
      }

      this.emit('proposal:added', info);
      console.log(`[Monitor] Tracking proposal ${proposalPdaStr} [${name}] (ends: ${new Date(endTime).toISOString()})`);
    } catch (e) {
      console.error(`Failed to handle ProposalLaunched: ${proposalPdaStr}`, e);
      logError('server', {
        type: 'proposal_launched_handler',
        proposalPda: proposalPdaStr,
        error: String(e),
      });
    }
  }

  private handleProposalFinalized(data: ProposalFinalizedEvent) {
    console.log('[Monitor] ProposalFinalized event:', JSON.stringify({
      proposal_id: data.proposal_id,
      proposal: data.proposal.toBase58(),
      winning_idx: data.winning_idx,
    }, null, 2));

    const proposalPdaStr = data.proposal.toBase58();
    const info = this.monitored.get(proposalPdaStr);

    if (info) {
      // Remove pool tracking
      for (const pool of info.pools) {
        this.poolToProposal.delete(pool);
      }

      this.monitored.delete(proposalPdaStr);
      this.emit('proposal:removed', info);
      console.log(`[Monitor] Proposal finalized: ${proposalPdaStr} (winner: ${data.winning_idx})`);
    }
  }

  getMonitored() {
    return Array.from(this.monitored.values());
  }

  removeMonitored(pda: string) {
    const info = this.monitored.get(pda);
    if (info && this.monitored.delete(pda)) {
      // Remove pool tracking
      for (const pool of info.pools) {
        this.poolToProposal.delete(pool);
      }
      this.emit('proposal:removed', info);
      return true;
    }
    return false;
  }
}
