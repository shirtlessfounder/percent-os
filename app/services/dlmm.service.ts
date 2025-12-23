import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { LoggerService } from './logger.service';

const API_URL = process.env.DAMM_API_URL || 'https://api.zcombinator.io';

export interface DlmmPoolConfigResponse {
  success: boolean;
  poolAddress: string;
  lpOwnerAddress: string;
  managerAddress: string;
}

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
  cleanupMode: boolean;
  activeBinPrice: number;
  hasLeftover: boolean;
  transferred: {
    tokenX: string;
    tokenY: string;
  };
  deposited: {
    tokenX: string;
    tokenY: string;
  };
  leftover: {
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
  tokenXDecimals: number;
  tokenYDecimals: number;
  activeBinPrice: number;
  hasLeftover: boolean;
  transferred: {
    tokenX: string;
    tokenY: string;
  };
  deposited: {
    tokenX: string;
    tokenY: string;
  };
  leftover: {
    tokenX: string;
    tokenY: string;
  };
  message: string;
}

export interface DlmmCleanupSwapBuildResponse {
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
  activeBinPrice: number;
  balances: {
    tokenX: string;
    tokenY: string;
  };
  swap: {
    inputMint: string;
    inputAmount: string;
    outputMint: string;
    expectedOutputAmount: string;
    direction: 'XtoY' | 'YtoX';
  };
  message: string;
}

export interface DlmmCleanupSwapConfirmResponse {
  success: boolean;
  signature: string;
  poolAddress: string;
  tokenXMint: string;
  tokenYMint: string;
  swap: {
    inputMint: string;
    inputAmount: string;
    outputMint: string;
    expectedOutputAmount: string;
    direction: 'XtoY' | 'YtoX';
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

  /**
   * Get pool configuration (LP owner and manager addresses)
   * @param poolAddress - DLMM pool address
   * @returns Pool config with LP owner and manager addresses
   */
  async getPoolConfig(poolAddress: string): Promise<DlmmPoolConfigResponse> {
    try {
      this.logger.info('Fetching DLMM pool config', { poolAddress });

      const response = await fetch(`${API_URL}/dlmm/pool/${poolAddress}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `Failed to fetch pool config: ${response.statusText}`);
      }

      const data = await response.json() as DlmmPoolConfigResponse;
      this.logger.info('Fetched DLMM pool config', {
        poolAddress,
        lpOwnerAddress: data.lpOwnerAddress,
        managerAddress: data.managerAddress
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to fetch DLMM pool config', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Build cleanup swap transaction
   * @param poolAddress - DLMM pool address
   * @returns Unsigned swap transaction and metadata, or null if no cleanup needed
   */
  async buildCleanupSwap(poolAddress: string): Promise<DlmmCleanupSwapBuildResponse | null> {
    try {
      this.logger.info('Building DLMM cleanup swap transaction', { poolAddress });

      const response = await fetch(`${API_URL}/dlmm/cleanup/swap/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ poolAddress }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        // Return null if no tokens to clean up (not an error)
        if (error.error?.includes('No leftover tokens') || error.error?.includes('too small')) {
          this.logger.info('No cleanup needed for DLMM pool', { poolAddress, reason: error.error });
          return null;
        }
        throw new Error(error.error || `Cleanup swap build failed: ${response.statusText}`);
      }

      const data = await response.json() as DlmmCleanupSwapBuildResponse;
      this.logger.info('Built DLMM cleanup swap transaction', {
        poolAddress,
        requestId: data.requestId,
        swapDirection: data.swap.direction,
        swapInputAmount: data.swap.inputAmount
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to build DLMM cleanup swap', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Confirm cleanup swap transaction
   * @param signedTransaction - Base58 encoded signed transaction
   * @param requestId - Request ID from build step
   * @returns Swap confirmation with signature
   */
  async confirmCleanupSwap(
    signedTransaction: string,
    requestId: string
  ): Promise<DlmmCleanupSwapConfirmResponse> {
    try {
      const response = await fetch(`${API_URL}/dlmm/cleanup/swap/confirm`, {
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
        throw new Error(error.error || `Cleanup swap confirm failed: ${response.statusText}`);
      }

      const data = await response.json() as DlmmCleanupSwapConfirmResponse;
      this.logger.info('Confirmed DLMM cleanup swap', {
        requestId,
        signature: data.signature
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to confirm DLMM cleanup swap', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Build cleanup deposit transaction (uses LP owner wallet balances)
   * @param poolAddress - DLMM pool address
   * @returns Unsigned deposit transaction and metadata, or null if no tokens to deposit
   */
  async buildCleanupDeposit(poolAddress: string): Promise<DlmmDepositBuildResponse | null> {
    try {
      this.logger.info('Building DLMM cleanup deposit transaction', { poolAddress });

      // Call deposit/build with 0,0 amounts to trigger cleanup mode
      const response = await fetch(`${API_URL}/dlmm/deposit/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenXAmount: '0',
          tokenYAmount: '0',
          poolAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        // Return null if no tokens available (not an error)
        if (error.error?.includes('No tokens available')) {
          this.logger.info('No tokens to deposit for DLMM cleanup', { poolAddress });
          return null;
        }
        throw new Error(error.error || `Cleanup deposit build failed: ${response.statusText}`);
      }

      const data = await response.json() as DlmmDepositBuildResponse;
      this.logger.info('Built DLMM cleanup deposit transaction', {
        poolAddress,
        requestId: data.requestId,
        depositedTokenX: data.deposited.tokenX,
        depositedTokenY: data.deposited.tokenY
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to build DLMM cleanup deposit', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Complete cleanup flow: swap leftover tokens → deposit all to pool
   * This should be called after transferring tokens to LP owner wallet
   * @param poolAddress - DLMM pool address
   * @param signTransaction - Function to sign transaction (from wallet/keypair)
   * @returns Deposit result, or null if no cleanup was needed
   */
  async cleanupSwapAndDeposit(
    poolAddress: string,
    signTransaction: (transaction: Transaction) => Promise<Transaction>
  ): Promise<DlmmDepositConfirmResponse | null> {
    try {
      this.logger.info('Starting DLMM cleanup flow', { poolAddress });

      // Step 1: Build and execute swap (if needed)
      const swapBuildData = await this.buildCleanupSwap(poolAddress);

      if (swapBuildData) {
        // Sign and confirm swap
        const swapTxBuffer = bs58.decode(swapBuildData.transaction);
        const swapTransaction = Transaction.from(swapTxBuffer);
        const signedSwapTx = await signTransaction(swapTransaction);
        const signedSwapTxBase58 = bs58.encode(
          signedSwapTx.serialize({ requireAllSignatures: false })
        );

        await this.confirmCleanupSwap(signedSwapTxBase58, swapBuildData.requestId);
        this.logger.info('Cleanup swap completed', { poolAddress });
      }

      // Step 2: Build and execute deposit (0,0 mode - uses LP owner balances)
      const depositBuildData = await this.buildCleanupDeposit(poolAddress);

      if (!depositBuildData) {
        this.logger.info('No tokens to deposit after cleanup', { poolAddress });
        return null;
      }

      // Sign and confirm deposit
      const depositTxBuffer = bs58.decode(depositBuildData.transaction);
      const depositTransaction = Transaction.from(depositTxBuffer);
      const signedDepositTx = await signTransaction(depositTransaction);
      const signedDepositTxBase58 = bs58.encode(
        signedDepositTx.serialize({ requireAllSignatures: false })
      );

      const confirmData = await this.confirmDlmmDeposit(signedDepositTxBase58, depositBuildData.requestId);

      this.logger.info('DLMM cleanup flow completed', {
        poolAddress,
        signature: confirmData.signature,
        depositedTokenX: confirmData.deposited.tokenX,
        depositedTokenY: confirmData.deposited.tokenY
      });

      return confirmData;
    } catch (error) {
      this.logger.error('Failed to complete DLMM cleanup flow', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
