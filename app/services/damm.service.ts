import { Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { LoggerService } from './logger.service';

const API_URL = process.env.DAMM_API_URL || 'https://api.zcombinator.io';

export interface DammPoolConfigResponse {
  success: boolean;
  poolAddress: string;
  lpOwnerAddress: string;
  managerAddress: string;
}

export interface DammDepositBuildResponse {
  success: boolean;
  transaction: string;
  requestId: string;
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  isTokenBNativeSOL: boolean;
  cleanupMode: boolean;
  poolPrice: number;
  hasLeftover: boolean;
  transferred: {
    tokenA: string;
    tokenB: string;
  };
  deposited: {
    tokenA: string;
    tokenB: string;
    liquidityDelta: string;
  };
  leftover: {
    tokenA: string;
    tokenB: string;
  };
  message: string;
}

export interface DammDepositConfirmResponse {
  success: boolean;
  signature: string;
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  poolPrice: number;
  hasLeftover: boolean;
  transferred: {
    tokenA: string;
    tokenB: string;
  };
  deposited: {
    tokenA: string;
    tokenB: string;
    liquidityDelta: string;
  };
  leftover: {
    tokenA: string;
    tokenB: string;
  };
  message: string;
}

export interface DammCleanupSwapBuildResponse {
  success: boolean;
  transaction: string;
  requestId: string;
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  lpOwnerAddress: string;
  managerAddress: string;
  poolPrice: number;
  balances: {
    tokenA: string;
    tokenB: string;
  };
  swap: {
    inputMint: string;
    inputAmount: string;
    outputMint: string;
    expectedOutputAmount: string;
    direction: 'AtoB' | 'BtoA';
  };
  message: string;
}

export interface DammCleanupSwapConfirmResponse {
  success: boolean;
  signature: string;
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
  swap: {
    inputMint: string;
    inputAmount: string;
    outputMint: string;
    expectedOutputAmount: string;
    direction: 'AtoB' | 'BtoA';
  };
  message: string;
}

/**
 * Service for interacting with DAMM pool API
 */
export class DammService {
  private logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger;
  }

  /**
   * Step 1: Build DAMM deposit transaction
   * @param tokenAAmount - Token A amount in UI units
   * @param tokenBAmount - Token B amount in UI units
   * @param poolAddress - Optional DAMM pool address (defaults to ZC-SOL pool if not provided)
   * @returns Unsigned transaction and metadata
   */
  async buildDammDeposit(
    tokenAAmount: number,
    tokenBAmount: number,
    poolAddress?: string
  ): Promise<DammDepositBuildResponse> {
    try {
      this.logger.info('Building DAMM deposit transaction', {
        tokenAAmount,
        tokenBAmount,
        poolAddress: poolAddress || 'default'
      });

      const requestBody: Record<string, unknown> = {
        tokenAAmount,
        tokenBAmount,
      };
      if (poolAddress) {
        requestBody.poolAddress = poolAddress;
      }

      const response = await fetch(`${API_URL}/damm/deposit/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `Deposit build failed: ${response.statusText}`);
      }

      const data = await response.json() as DammDepositBuildResponse;
      this.logger.info('Built DAMM deposit transaction', {
        tokenAAmount,
        tokenBAmount,
        requestId: data.requestId
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to build DAMM deposit', {
        tokenAAmount,
        tokenBAmount,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Step 2: Confirm DAMM deposit transaction
   * @param signedTransaction - Base58 encoded signed transaction
   * @param requestId - Request ID from build step
   * @returns Transaction signature and amounts
   */
  async confirmDammDeposit(
    signedTransaction: string,
    requestId: string
  ): Promise<DammDepositConfirmResponse> {
    try {
      const response = await fetch(`${API_URL}/damm/deposit/confirm`, {
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
        throw new Error(error.error || `Deposit confirm failed: ${response.statusText}`);
      }

      const data = await response.json() as DammDepositConfirmResponse;
      this.logger.info('Confirmed DAMM deposit transaction', {
        requestId,
        signature: data.signature
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to confirm DAMM deposit', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Complete deposit flow: build → sign → confirm
   * @param tokenAAmount - Token A amount in UI units
   * @param tokenBAmount - Token B amount in UI units
   * @param signTransaction - Function to sign transaction (from wallet/keypair)
   * @param poolAddress - Optional DAMM pool address (defaults to ZC-SOL pool if not provided)
   * @returns Deposit result with amounts
   */
  async depositToDammPool(
    tokenAAmount: number,
    tokenBAmount: number,
    signTransaction: (transaction: Transaction) => Promise<Transaction>,
    poolAddress?: string
  ): Promise<DammDepositConfirmResponse> {
    try {
      // Step 1: Build unsigned transaction
      const buildData = await this.buildDammDeposit(tokenAAmount, tokenBAmount, poolAddress);

      // Step 2: Deserialize and sign transaction
      const transactionBuffer = bs58.decode(buildData.transaction);
      const transaction = Transaction.from(transactionBuffer);

      const signedTransaction = await signTransaction(transaction);

      // Step 3: Serialize signed transaction
      const signedTransactionBase58 = bs58.encode(
        signedTransaction.serialize({ requireAllSignatures: false })
      );

      // Step 4: Confirm deposit
      const confirmData = await this.confirmDammDeposit(signedTransactionBase58, buildData.requestId);

      this.logger.info('Completed DAMM deposit', {
        tokenAAmount,
        tokenBAmount,
        signature: confirmData.signature
      });

      return confirmData;
    } catch (error) {
      this.logger.error('Failed to complete DAMM deposit', {
        tokenAAmount,
        tokenBAmount,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get pool configuration (LP owner and manager addresses)
   * @param poolAddress - DAMM pool address
   * @returns Pool config with LP owner and manager addresses
   */
  async getPoolConfig(poolAddress: string): Promise<DammPoolConfigResponse> {
    try {
      this.logger.info('Fetching DAMM pool config', { poolAddress });

      const response = await fetch(`${API_URL}/damm/pool/${poolAddress}/config`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error || `Failed to fetch pool config: ${response.statusText}`);
      }

      const data = await response.json() as DammPoolConfigResponse;
      this.logger.info('Fetched DAMM pool config', {
        poolAddress,
        lpOwnerAddress: data.lpOwnerAddress,
        managerAddress: data.managerAddress
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to fetch DAMM pool config', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Build cleanup swap transaction
   * @param poolAddress - DAMM pool address
   * @returns Unsigned swap transaction and metadata, or null if no cleanup needed
   */
  async buildCleanupSwap(poolAddress: string): Promise<DammCleanupSwapBuildResponse | null> {
    try {
      this.logger.info('Building DAMM cleanup swap transaction', { poolAddress });

      const response = await fetch(`${API_URL}/damm/cleanup/swap/build`, {
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
          this.logger.info('No cleanup needed for DAMM pool', { poolAddress, reason: error.error });
          return null;
        }
        throw new Error(error.error || `Cleanup swap build failed: ${response.statusText}`);
      }

      const data = await response.json() as DammCleanupSwapBuildResponse;
      this.logger.info('Built DAMM cleanup swap transaction', {
        poolAddress,
        requestId: data.requestId,
        swapDirection: data.swap.direction,
        swapInputAmount: data.swap.inputAmount
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to build DAMM cleanup swap', {
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
  ): Promise<DammCleanupSwapConfirmResponse> {
    try {
      const response = await fetch(`${API_URL}/damm/cleanup/swap/confirm`, {
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

      const data = await response.json() as DammCleanupSwapConfirmResponse;
      this.logger.info('Confirmed DAMM cleanup swap', {
        requestId,
        signature: data.signature
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to confirm DAMM cleanup swap', {
        requestId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Build cleanup deposit transaction (uses LP owner wallet balances)
   * @param poolAddress - DAMM pool address
   * @returns Unsigned deposit transaction and metadata, or null if no tokens to deposit
   */
  async buildCleanupDeposit(poolAddress: string): Promise<DammDepositBuildResponse | null> {
    try {
      this.logger.info('Building DAMM cleanup deposit transaction', { poolAddress });

      // Call deposit/build with 0,0 amounts to trigger cleanup mode
      const response = await fetch(`${API_URL}/damm/deposit/build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenAAmount: 0,
          tokenBAmount: 0,
          poolAddress,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        // Return null if no tokens available (not an error)
        if (error.error?.includes('No tokens available')) {
          this.logger.info('No tokens to deposit for DAMM cleanup', { poolAddress });
          return null;
        }
        throw new Error(error.error || `Cleanup deposit build failed: ${response.statusText}`);
      }

      const data = await response.json() as DammDepositBuildResponse;
      this.logger.info('Built DAMM cleanup deposit transaction', {
        poolAddress,
        requestId: data.requestId,
        depositedTokenA: data.deposited.tokenA,
        depositedTokenB: data.deposited.tokenB
      });

      return data;
    } catch (error) {
      this.logger.error('Failed to build DAMM cleanup deposit', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Complete cleanup flow: swap leftover tokens → deposit all to pool
   * This should be called after transferring tokens to LP owner wallet
   * @param poolAddress - DAMM pool address
   * @param signTransaction - Function to sign transaction (from wallet/keypair)
   * @returns Deposit result, or null if no cleanup was needed
   */
  async cleanupSwapAndDeposit(
    poolAddress: string,
    signTransaction: (transaction: Transaction) => Promise<Transaction>
  ): Promise<DammDepositConfirmResponse | null> {
    try {
      this.logger.info('Starting DAMM cleanup flow', { poolAddress });

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

      const confirmData = await this.confirmDammDeposit(signedDepositTxBase58, depositBuildData.requestId);

      this.logger.info('DAMM cleanup flow completed', {
        poolAddress,
        signature: confirmData.signature,
        depositedTokenA: confirmData.deposited.tokenA,
        depositedTokenB: confirmData.deposited.tokenB
      });

      return confirmData;
    } catch (error) {
      this.logger.error('Failed to complete DAMM cleanup flow', {
        poolAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
