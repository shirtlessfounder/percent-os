import { getPool } from '../utils/database';
import { IPersistenceService, IProposalDB, IModeratorStateDB } from '../types/persistence.interface';
import { IProposal, IProposalSerializedData } from '../types/proposal.interface';
import { IModeratorConfig } from '../types/moderator.interface';
import { Proposal } from '../proposal';
import { PublicKey, Keypair } from '@solana/web3.js';
import { Pool } from 'pg';
import fs from 'fs';
import { ExecutionService } from './execution.service';
import { LoggerService } from './logger.service';
import { Commitment } from '@app/types/execution.interface';

/**
 * Service for persisting and loading state from PostgreSQL database
 */
export class PersistenceService implements IPersistenceService {
  private pool: Pool;
  private moderatorId: number;

  constructor(moderatorId: number) {
    this.pool = getPool();
    this.moderatorId = moderatorId;
  }

  /**
   * Get the current proposal ID counter
   * @returns The current proposal ID counter
   */
  async getProposalIdCounter(): Promise<number> {
    try {
      const result = await this.pool.query<{ proposal_id_counter: number }>(
        'SELECT proposal_id_counter FROM moderator_state WHERE id = $1',
        [this.moderatorId]
      );

      if (result.rows.length === 0) {
        // No moderator state found, return 1 as the starting counter
        return 1;
      }

      // Return the counter + 1 for the next proposal ID
      return result.rows[0].proposal_id_counter + 1;
    } catch (error) {
      console.error('Failed to fetch proposal ID counter:', error);
      throw error;
    }
  }

  /**
   * Save a proposal to the database (backward compatible)
   */
  async saveProposal(proposal: IProposal): Promise<void> {
    try {
      // Use the proposal's serialize method
      const serializedData = proposal.serialize();

      // Create old format transaction_data for backward compatibility
      const transactionData = {
        instructions: serializedData.transactionInstructions,
        feePayer: serializedData.transactionFeePayer || null
      };

      // Use old column names for backward compatibility
      const query = `
        INSERT INTO proposals (
          id, moderator_id, proposal_id, title, description, status,
          created_at, finalized_at, proposal_length,
          transaction_data, transaction_fee_payer,
          base_mint, quote_mint, base_decimals, quote_decimals, authority,
          amm_config, twap_config,
          pass_amm_state, fail_amm_state,
          base_vault_state, quote_vault_state,
          twap_oracle_state,
          spot_pool_address, total_supply
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
        ON CONFLICT (moderator_id, proposal_id) DO UPDATE SET
          status = EXCLUDED.status,
          pass_amm_state = EXCLUDED.pass_amm_state,
          fail_amm_state = EXCLUDED.fail_amm_state,
          base_vault_state = EXCLUDED.base_vault_state,
          quote_vault_state = EXCLUDED.quote_vault_state,
          twap_oracle_state = EXCLUDED.twap_oracle_state,
          twap_config = EXCLUDED.twap_config,
          transaction_fee_payer = EXCLUDED.transaction_fee_payer,
          updated_at = NOW()
      `;

      // Get authority from serialized data (we can extract from any vault or AMM)
      const authority = serializedData.baseMint; // Use baseMint as placeholder for authority

      await this.pool.query(query, [
        serializedData.id,
        serializedData.moderatorId,
        serializedData.id,  // proposal_id is same as id for now
        serializedData.title,
        serializedData.description || null,
        serializedData.status,
        new Date(serializedData.createdAt),
        new Date(serializedData.finalizedAt),
        serializedData.proposalLength,
        JSON.stringify(transactionData), // Old format transaction_data
        serializedData.transactionFeePayer || null,
        serializedData.baseMint,
        serializedData.quoteMint,
        serializedData.baseDecimals,
        serializedData.quoteDecimals,
        authority, // Placeholder for authority column
        JSON.stringify(serializedData.ammConfig),
        JSON.stringify(serializedData.twapConfig || {}),
        JSON.stringify(serializedData.pAMMData),     // Store in old column name
        JSON.stringify(serializedData.fAMMData),     // Store in old column name
        JSON.stringify(serializedData.baseVaultData), // Store in old column name
        JSON.stringify(serializedData.quoteVaultData),// Store in old column name
        JSON.stringify(serializedData.twapOracleData),// Store in old column name
        serializedData.spotPoolAddress || null,
        serializedData.totalSupply
      ]);
    } catch (error) {
      console.error('Failed to save proposal:', error);
      throw error;
    }
  }

  /**
   * Load a proposal from the database
   */
  async loadProposal(id: number): Promise<IProposal | null> {
    try {
      const result = await this.pool.query<IProposalDB>(
        'SELECT * FROM proposals WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return this.deserializeProposal(row);
    } catch (error) {
      console.error('Failed to load proposal:', error);
      throw error;
    }
  }

  /**
   * Load all proposals from the database
   */
  async loadAllProposals(): Promise<IProposal[]> {
    try {
      const result = await this.pool.query<IProposalDB>(
        'SELECT * FROM proposals ORDER BY id'
      );

      const proposals: IProposal[] = [];
      for (const row of result.rows) {
        const proposal = await this.deserializeProposal(row);
        if (proposal) {
          proposals.push(proposal);
        }
      }

      return proposals;
    } catch (error) {
      console.error('Failed to load proposals:', error);
      throw error;
    }
  }

  /**
   * Get proposals for frontend (simplified data)
   */
  async getProposalsForFrontend(): Promise<IProposalDB[]> {
    try {
      const result = await this.pool.query<IProposalDB>(
        'SELECT * FROM proposals ORDER BY created_at DESC'
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get proposals for frontend:', error);
      throw error;
    }
  }

  /**
   * Get a single proposal for frontend
   */
  async getProposalForFrontend(id: number): Promise<IProposalDB | null> {
    try {
      const result = await this.pool.query<IProposalDB>(
        'SELECT * FROM proposals WHERE id = $1',
        [id]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('Failed to get proposal for frontend:', error);
      throw error;
    }
  }

  /**
   * Save moderator state to the database
   */
  async saveModeratorState(proposalCounter: number, config: IModeratorConfig, protocolName?: string): Promise<void> {
    try {
      const configData = {
        baseMint: config.baseMint.toBase58(),
        quoteMint: config.quoteMint.toBase58(),
        baseDecimals: config.baseDecimals,
        quoteDecimals: config.quoteDecimals,
        authority: config.authority.publicKey.toBase58(),
        rpcUrl: config.rpcEndpoint,
      };

      const query = `
        INSERT INTO moderator_state (id, proposal_id_counter, config, protocol_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          proposal_id_counter = EXCLUDED.proposal_id_counter,
          config = EXCLUDED.config,
          protocol_name = EXCLUDED.protocol_name,
          updated_at = NOW()
      `;

      await this.pool.query(query, [this.moderatorId, proposalCounter, JSON.stringify(configData), protocolName || null]);
    } catch (error) {
      console.error('Failed to save moderator state:', error);
      throw error;
    }
  }

  /**
   * Load moderator state from the database
   */
  async loadModeratorState(): Promise<{ proposalCounter: number; config: IModeratorConfig; protocolName?: string } | null> {
    try {
      const result = await this.pool.query<IModeratorStateDB>(
        'SELECT * FROM moderator_state WHERE id = $1',
        [this.moderatorId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Load authority keypair - use test authority if in test mode
      let authority: Keypair;

      // Check if we're in test mode by checking if test moderator service is available
      try {
        const TestModeratorService = (await import('../../src/test/test-moderator.service')).default;
        const testInfo = TestModeratorService.getTestInfo();

        if (testInfo) {
          // We're in test mode - use the test authority that was used to create the mints
          const { getTestModeConfig } = await import('../../src/test/config');
          const testConfig = getTestModeConfig();
          authority = testConfig.wallets.authority;
        } else {
          throw new Error('Not in test mode');
        }
      } catch {
        // We're in production mode - load from filesystem
        const keypairPath = process.env.SOLANA_KEYPAIR_PATH || './wallet.json';
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
        authority = Keypair.fromSecretKey(new Uint8Array(keypairData));
      }

      const config: IModeratorConfig = {
        baseMint: new PublicKey(row.config.baseMint),
        quoteMint: new PublicKey(row.config.quoteMint),
        baseDecimals: row.config.baseDecimals,
        quoteDecimals: row.config.quoteDecimals,
        authority,
        rpcEndpoint: row.config.rpcUrl,
      };

      return {
        proposalCounter: row.proposal_id_counter,
        config,
        protocolName: row.protocol_name || undefined,
      };
    } catch (error) {
      console.error('Failed to load moderator state:', error);
      return null;
    }
  }

  /**
   * Helper method to deserialize a Proposal object from database row
   */
  private async deserializeProposal(row: IProposalDB): Promise<IProposal | null> {
    try {
      // Load authority keypair - use test authority if in test mode
      let authority: Keypair;

      // Check if we're in test mode by checking if test moderator service is available
      try {
        const TestModeratorService = (await import('../../src/test/test-moderator.service')).default;
        const testInfo = TestModeratorService.getTestInfo();

        if (testInfo) {
          // We're in test mode - use the test authority that was used to create the mints
          const { getTestModeConfig } = await import('../../src/test/config');
          const testConfig = getTestModeConfig();
          authority = testConfig.wallets.authority;
        } else {
          throw new Error('Not in test mode');
        }
      } catch {
        // We're in production mode - load from filesystem
        const keypairPath = process.env.SOLANA_KEYPAIR_PATH || './wallet.json';
        const fileContent = fs.readFileSync(keypairPath, 'utf-8');
        const keypairData = JSON.parse(fileContent);
        authority = Keypair.fromSecretKey(new Uint8Array(keypairData));
      }

      // Create logger first
      const logger = new LoggerService('Proposal');

      // Create execution service with logger
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://bernie-zo3q7f-fast-mainnet.helius-rpc.com';
      const executionService = new ExecutionService({
        rpcEndpoint: rpcUrl,
        commitment: Commitment.Confirmed,
        maxRetries: 3,
        skipPreflight: false
      }, logger);

      // Parse the serialized data from the database
      const serializedData: IProposalSerializedData = {
        id: row.id,
        moderatorId: row.moderator_id,
        title: row.title || '',
        description: row.description || undefined,
        createdAt: new Date(row.created_at).getTime(),
        proposalLength: parseInt(row.proposal_length),
        finalizedAt: new Date(row.finalized_at).getTime(),
        status: row.status,

        baseMint: row.base_mint,
        quoteMint: row.quote_mint,
        baseDecimals: row.base_decimals,
        quoteDecimals: row.quote_decimals,

        transactionInstructions: typeof row.transaction_instructions === 'string'
          ? JSON.parse(row.transaction_instructions)
          : row.transaction_instructions,
        transactionFeePayer: row.transaction_fee_payer || undefined,

        ammConfig: typeof row.amm_config === 'string'
          ? JSON.parse(row.amm_config)
          : row.amm_config,

        twapConfig: typeof row.twap_config === 'string'
          ? JSON.parse(row.twap_config)
          : row.twap_config,

        spotPoolAddress: row.spot_pool_address || undefined,
        totalSupply: row.total_supply || 1000000000,

        pAMMData: typeof row.pass_amm_data === 'string'
          ? JSON.parse(row.pass_amm_data)
          : row.pass_amm_data,
        fAMMData: typeof row.fail_amm_data === 'string'
          ? JSON.parse(row.fail_amm_data)
          : row.fail_amm_data,
        baseVaultData: typeof row.base_vault_data === 'string'
          ? JSON.parse(row.base_vault_data)
          : row.base_vault_data,
        quoteVaultData: typeof row.quote_vault_data === 'string'
          ? JSON.parse(row.quote_vault_data)
          : row.quote_vault_data,
        twapOracleData: typeof row.twap_oracle_data === 'string'
          ? JSON.parse(row.twap_oracle_data)
          : row.twap_oracle_data,
      };

      // Use the Proposal.deserialize method
      const proposal = await Proposal.deserialize(serializedData, {
        authority,
        executionService,
        logger
      });

      return proposal;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to deserialize proposal #${row.id}:`, {
        proposalId: row.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Failed to deserialize proposal #${row.id}: ${errorMessage}`);
    }
  }
}