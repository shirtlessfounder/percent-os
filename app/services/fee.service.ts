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

import {
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from '@solana/spl-token';
import { IExecutionService } from '../types/execution.interface';
import { LoggerService } from './logger.service';

export interface IFeeTransferResult {
  success: boolean;
  signature?: string;
  feeTokenA: string;
  feeTokenB: string;
  error?: string;
}

/**
 * Service for collecting and transferring fees from decision markets
 * Fees are calculated as the difference between withdrawn and deposited amounts
 */
export class FeeService {
  private executionService: IExecutionService;
  private logger: LoggerService;
  private feeWalletAddress: PublicKey | null;

  constructor(executionService: IExecutionService, logger: LoggerService) {
    this.executionService = executionService;
    this.logger = logger;

    // Load fee wallet from environment
    const feeWalletEnv = process.env.FEE_WALLET_ADDRESS;
    if (feeWalletEnv && feeWalletEnv !== 'your-fee-wallet-address-here') {
      try {
        this.feeWalletAddress = new PublicKey(feeWalletEnv);
        this.logger.info('Fee wallet configured', {
          feeWallet: this.feeWalletAddress.toBase58(),
        });
      } catch (error) {
        this.logger.warn('Invalid FEE_WALLET_ADDRESS, fee collection disabled', {
          error: error instanceof Error ? error.message : String(error),
        });
        this.feeWalletAddress = null;
      }
    } else {
      this.logger.info('FEE_WALLET_ADDRESS not configured, fee collection disabled');
      this.feeWalletAddress = null;
    }
  }

  /**
   * Check if fee collection is enabled
   */
  get isEnabled(): boolean {
    return this.feeWalletAddress !== null;
  }

  /**
   * Calculate fees from withdrawal and deposit amounts
   * @param withdrawnTokenA - Original token A amount withdrawn (raw units as string)
   * @param withdrawnTokenB - Original token B amount withdrawn (raw units as string)
   * @param depositedTokenA - Token A amount deposited back (raw units as string)
   * @param depositedTokenB - Token B amount deposited back (raw units as string)
   * @returns Fee amounts for both tokens
   */
  calculateFees(
    withdrawnTokenA: string,
    withdrawnTokenB: string,
    depositedTokenA: string,
    depositedTokenB: string
  ): { feeTokenA: bigint; feeTokenB: bigint } {
    const withdrawnA = BigInt(withdrawnTokenA);
    const withdrawnB = BigInt(withdrawnTokenB);
    const depositedA = BigInt(depositedTokenA);
    const depositedB = BigInt(depositedTokenB);

    // Fee = withdrawn - deposited (what remains after deposit-back)
    const feeTokenA = withdrawnA > depositedA ? withdrawnA - depositedA : 0n;
    const feeTokenB = withdrawnB > depositedB ? withdrawnB - depositedB : 0n;

    return { feeTokenA, feeTokenB };
  }

  /**
   * Transfer collected fees to the fee wallet
   * All transfers are batched into a single transaction for efficiency
   * @param authority - Authority keypair that holds the fees
   * @param baseMint - Base token mint (token A)
   * @param quoteMint - Quote token mint (token B, usually wrapped SOL)
   * @param feeTokenA - Fee amount for token A (raw units)
   * @param feeTokenB - Fee amount for token B (raw units)
   * @returns Result of fee transfer
   */
  async transferFees(
    authority: Keypair,
    baseMint: PublicKey,
    quoteMint: PublicKey,
    feeTokenA: bigint,
    feeTokenB: bigint
  ): Promise<IFeeTransferResult> {
    if (!this.feeWalletAddress) {
      return {
        success: false,
        feeTokenA: feeTokenA.toString(),
        feeTokenB: feeTokenB.toString(),
        error: 'Fee wallet not configured',
      };
    }

    const result: IFeeTransferResult = {
      success: true,
      feeTokenA: feeTokenA.toString(),
      feeTokenB: feeTokenB.toString(),
    };

    // Skip if no fees to transfer
    if (feeTokenA === 0n && feeTokenB === 0n) {
      this.logger.info('No fees to transfer');
      return result;
    }

    try {
      const transaction = new Transaction();

      // Add token A transfer instructions (SPL token)
      if (feeTokenA > 0n) {
        const sourceATA = await getAssociatedTokenAddress(
          baseMint,
          authority.publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const destinationATA = await getAssociatedTokenAddress(
          baseMint,
          this.feeWalletAddress,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // Create destination ATA if needed (idempotent)
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            authority.publicKey,
            destinationATA,
            this.feeWalletAddress,
            baseMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );

        // Add transfer instruction
        transaction.add(
          createTransferInstruction(
            sourceATA,
            destinationATA,
            authority.publicKey,
            feeTokenA,
            [],
            TOKEN_PROGRAM_ID
          )
        );

        this.logger.info('Added token A fee transfer to batch', {
          amount: feeTokenA.toString(),
          mint: baseMint.toBase58(),
        });
      }

      // Add token B transfer instructions (SOL or SPL token)
      if (feeTokenB > 0n) {
        const isNativeSol = quoteMint.equals(NATIVE_MINT);

        if (isNativeSol) {
          // Transfer native SOL
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: authority.publicKey,
              toPubkey: this.feeWalletAddress,
              lamports: feeTokenB,
            })
          );

          this.logger.info('Added native SOL fee transfer to batch', {
            amount: feeTokenB.toString(),
          });
        } else {
          // Transfer SPL token (wrapped SOL or other)
          const sourceATA = await getAssociatedTokenAddress(
            quoteMint,
            authority.publicKey,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          const destinationATA = await getAssociatedTokenAddress(
            quoteMint,
            this.feeWalletAddress,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          );

          // Create destination ATA if needed (idempotent)
          transaction.add(
            createAssociatedTokenAccountIdempotentInstruction(
              authority.publicKey,
              destinationATA,
              this.feeWalletAddress,
              quoteMint,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          );

          // Add transfer instruction
          transaction.add(
            createTransferInstruction(
              sourceATA,
              destinationATA,
              authority.publicKey,
              feeTokenB,
              [],
              TOKEN_PROGRAM_ID
            )
          );

          this.logger.info('Added token B fee transfer to batch', {
            amount: feeTokenB.toString(),
            mint: quoteMint.toBase58(),
          });
        }
      }

      // Execute batched transaction
      const txResult = await this.executionService.executeTx(transaction, authority);

      if (txResult.status === 'failed') {
        throw new Error(`Fee transfer failed: ${txResult.error}`);
      }

      result.signature = txResult.signature;
      this.logger.info('Fee transfer completed', {
        signature: txResult.signature,
        feeTokenA: feeTokenA.toString(),
        feeTokenB: feeTokenB.toString(),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to transfer fees', {
        error: errorMessage,
        feeTokenA: feeTokenA.toString(),
        feeTokenB: feeTokenB.toString(),
      });
      return {
        ...result,
        success: false,
        error: errorMessage,
      };
    }
  }

}
