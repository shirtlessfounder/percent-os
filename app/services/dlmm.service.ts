import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { LoggerService } from './logger.service';

const API_URL = process.env.DAMM_API_URL || 'https://api.zcombinator.io';

export interface DlmmDepositBuildResponse {
  success: boolean;
  transaction: string;
  requestId: string;
  poolAddress: string;
  tokenXMint: string;
  tokenYMint: string;
  tokenXDecimals: number;
  tokenYDecimals: number;
  lpOwnerAddress: string;
  managerAddress: string;
  instructionsCount: number;
  amounts: {
    tokenX: string;
    tokenY: string;
  };
  message: string;
}

export interface DlmmDepositConfirmResponse {
  success: boolean;
  signature: string;
  poolAddress: string;
  tokenXMint: string;
  tokenYMint: string;
  amounts: {
    tokenX: string;
    tokenY: string;
  };
  message: string;
}

/**
 * Service for interacting with DLMM pool API
 * Handles Meteora Dynamic Liquidity Market Maker operations
 */
export class DlmmService {
  private logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Step 1: Build DLMM deposit transaction
   * @param tokenXAmount - Token X amount in raw units (base token)
   * @param tokenYAmount - Token Y amount in raw units (quote token, typically SOL)
   * @param poolAddress - DLMM pool address
   * @returns Unsigned transaction and metadata
   */
  async buildDlmmDeposit(
    tokenXAmount: string,
    tokenYAmount: string,
    poolAddress: string
  ): Promise<DlmmDepositBuildResponse> {
    try {
      this.logger.info('Building DLMM deposit transaction', {
        tokenXAmount,
        tokenYAmount,
        poolAddress
      });

      const response = await fetch(`${API_URL}/dlmm/deposit/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenXAmount,
          tokenYAmount,
          poolAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `DLMM deposit build failed: ${response.statusText}`);
      }

      const data = await response.json() as DlmmDepositBuildResponse;
      this.logger.info('Built DLMM deposit transaction', {
        tokenXAmount,
        tokenYAmount,
        requestId: data.requestId
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to build DLMM deposit', {
        tokenXAmount,
        tokenYAmount,
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Step 2: Confirm DLMM deposit transaction
   * @param signedTransaction - Base58 encoded signed transaction
   * @param requestId - Request ID from build step
   * @returns Transaction signature and amounts
   */
  async confirmDlmmDeposit(
    signedTransaction: string,
    requestId: string
  ): Promise<DlmmDepositConfirmResponse> {
    try {
      const response = await fetch(`${API_URL}/dlmm/deposit/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signedTransaction,
          requestId,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `DLMM deposit confirm failed: ${response.statusText}`);
      }

      const data = await response.json() as DlmmDepositConfirmResponse;
      this.logger.info('Confirmed DLMM deposit transaction', {
        requestId,
        signature: data.signature
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to confirm DLMM deposit', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Complete deposit flow: build → sign → confirm
   * @param tokenXAmount - Token X amount in raw units (base token)
   * @param tokenYAmount - Token Y amount in raw units (quote token)
   * @param signTransaction - Function to sign transaction (from wallet/keypair)
   * @param poolAddress - DLMM pool address
   * @returns Deposit result with amounts
   */
  async depositToDlmmPool(
    tokenXAmount: string,
    tokenYAmount: string,
    signTransaction: (transaction: Transaction) => Promise<Transaction>,
    poolAddress: string
  ): Promise<DlmmDepositConfirmResponse> {
    try {
      // Step 1: Build unsigned transaction
      const buildData = await this.buildDlmmDeposit(tokenXAmount, tokenYAmount, poolAddress);

      // Step 2: Deserialize and sign transaction
      const transactionBuffer = bs58.decode(buildData.transaction);
      const transaction = Transaction.from(transactionBuffer);

      const signedTransaction = await signTransaction(transaction);

      // Step 3: Serialize signed transaction
      const signedTransactionBase58 = bs58.encode(
        signedTransaction.serialize({ requireAllSignatures: false })
      );

      // Step 4: Confirm deposit
      const confirmData = await this.confirmDlmmDeposit(signedTransactionBase58, buildData.requestId);

      this.logger.info('Completed DLMM deposit', {
        tokenXAmount,
        tokenYAmount,
        poolAddress,
        signature: confirmData.signature
      });

      return confirmData;
    } catch (error) {
      this.logger.error('Failed to complete DLMM deposit', {
        tokenXAmount,
        tokenYAmount,
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
