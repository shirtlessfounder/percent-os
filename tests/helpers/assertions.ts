import { expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { getAccount, getMint } from '@solana/spl-token';
import { connection } from '../setup/devnet';
import { Proposal } from '../../app/proposal';
import { ProposalStatus } from '../../app/types/moderator.interface';

/**
 * Custom Vitest matchers for Solana testing
 */
declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveBalance(expectedBalance: bigint, tolerance?: bigint): Promise<void>;
    toBeConfirmed(): Promise<void>;
    toHaveStatus(expectedStatus: ProposalStatus): void;
    toBeWithinBps(expected: number, bps: number): void;
    toHaveMintAuthority(expectedAuthority: PublicKey | null): Promise<void>;
    toHaveTokenBalance(mint: PublicKey, expectedBalance: bigint, tolerance?: bigint): Promise<void>;
  }
}

/**
 * Check if a token account has expected balance
 */
expect.extend({
  async toHaveBalance(received: PublicKey, expectedBalance: bigint, tolerance: bigint = BigInt(0)) {
    const { isNot } = this;
    
    try {
      const account = await getAccount(connection, received);
      const actualBalance = account.amount;
      
      const diff = actualBalance > expectedBalance 
        ? actualBalance - expectedBalance 
        : expectedBalance - actualBalance;
      
      const pass = diff <= tolerance;
      
      return {
        pass,
        message: () => {
          if (pass) {
            return `Expected token account ${received.toBase58()} ${isNot ? 'not ' : ''}to have balance ${expectedBalance}±${tolerance}, but it does`;
          } else {
            return `Expected token account ${received.toBase58()} to have balance ${expectedBalance}±${tolerance}, but got ${actualBalance}`;
          }
        }
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Failed to get token account ${received.toBase58()}: ${error}`
      };
    }
  }
});

/**
 * Check if a transaction signature is confirmed
 */
expect.extend({
  async toBeConfirmed(received: string) {
    const { isNot } = this;
    
    try {
      const status = await connection.getSignatureStatus(received);
      const isConfirmed = status.value?.confirmationStatus === 'confirmed' || 
                         status.value?.confirmationStatus === 'finalized';
      
      return {
        pass: isConfirmed,
        message: () => {
          if (isConfirmed) {
            return `Expected transaction ${received} ${isNot ? 'not ' : ''}to be confirmed, but it is`;
          } else {
            return `Expected transaction ${received} to be confirmed, but status is ${status.value?.confirmationStatus || 'unknown'}`;
          }
        }
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Failed to get transaction status for ${received}: ${error}`
      };
    }
  }
});

/**
 * Check if a proposal has expected status
 */
expect.extend({
  toHaveStatus(received: Proposal, expectedStatus: ProposalStatus) {
    const { isNot } = this;
    const actualStatus = received.status;
    const pass = actualStatus === expectedStatus;
    
    return {
      pass,
      message: () => {
        if (pass) {
          return `Expected proposal ${received.id} ${isNot ? 'not ' : ''}to have status ${expectedStatus}, but it does`;
        } else {
          return `Expected proposal ${received.id} to have status ${expectedStatus}, but got ${actualStatus}`;
        }
      }
    };
  }
});

/**
 * Check if a value is within basis points tolerance
 */
expect.extend({
  toBeWithinBps(received: number, expected: number, bps: number) {
    const { isNot } = this;
    const tolerance = (expected * bps) / 10000;
    const diff = Math.abs(received - expected);
    const pass = diff <= tolerance;
    
    return {
      pass,
      message: () => {
        if (pass) {
          return `Expected ${received} ${isNot ? 'not ' : ''}to be within ${bps} bps of ${expected}, but it is`;
        } else {
          return `Expected ${received} to be within ${bps} bps of ${expected} (±${tolerance}), but difference is ${diff}`;
        }
      }
    };
  }
});

/**
 * Check if a mint has expected authority
 */
expect.extend({
  async toHaveMintAuthority(received: PublicKey, expectedAuthority: PublicKey | null) {
    const { isNot } = this;
    
    try {
      const mintInfo = await getMint(connection, received);
      const actualAuthority = mintInfo.mintAuthority;
      
      const pass = expectedAuthority === null 
        ? actualAuthority === null
        : actualAuthority?.equals(expectedAuthority) || false;
      
      return {
        pass,
        message: () => {
          if (pass) {
            return `Expected mint ${received.toBase58()} ${isNot ? 'not ' : ''}to have authority ${expectedAuthority?.toBase58() || 'null'}, but it does`;
          } else {
            return `Expected mint ${received.toBase58()} to have authority ${expectedAuthority?.toBase58() || 'null'}, but got ${actualAuthority?.toBase58() || 'null'}`;
          }
        }
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Failed to get mint ${received.toBase58()}: ${error}`
      };
    }
  }
});

/**
 * Check if a wallet has expected token balance
 */
expect.extend({
  async toHaveTokenBalance(
    received: PublicKey, // wallet address
    mint: PublicKey,
    expectedBalance: bigint,
    tolerance: bigint = BigInt(0)
  ) {
    const { isNot } = this;
    
    try {
      // Find associated token account
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        received,
        { mint }
      );
      
      if (tokenAccounts.value.length === 0) {
        return {
          pass: expectedBalance === BigInt(0),
          message: () => `Wallet ${received.toBase58()} has no token account for mint ${mint.toBase58()}`
        };
      }
      
      const account = tokenAccounts.value[0];
      const actualBalance = BigInt(account.account.data.parsed.info.tokenAmount.amount);
      
      const diff = actualBalance > expectedBalance 
        ? actualBalance - expectedBalance 
        : expectedBalance - actualBalance;
      
      const pass = diff <= tolerance;
      
      return {
        pass,
        message: () => {
          if (pass) {
            return `Expected wallet ${received.toBase58()} ${isNot ? 'not ' : ''}to have token balance ${expectedBalance}±${tolerance}, but it does`;
          } else {
            return `Expected wallet ${received.toBase58()} to have token balance ${expectedBalance}±${tolerance}, but got ${actualBalance}`;
          }
        }
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Failed to get token balance for wallet ${received.toBase58()}: ${error}`
      };
    }
  }
});

/**
 * Helper assertions for common checks
 */
export async function assertTransactionSuccess(signature: string) {
  await expect(signature).toBeConfirmed();
}

export function assertProposalStatus(proposal: Proposal, status: ProposalStatus) {
  expect(proposal).toHaveStatus(status);
}

export async function assertTokenBalance(
  account: PublicKey,
  expectedBalance: bigint,
  tolerance: bigint = BigInt(0)
) {
  await expect(account).toHaveBalance(expectedBalance, tolerance);
}

export async function assertMintAuthority(
  mint: PublicKey,
  expectedAuthority: PublicKey | null
) {
  await expect(mint).toHaveMintAuthority(expectedAuthority);
}

export async function assertWalletTokenBalance(
  wallet: PublicKey,
  mint: PublicKey,
  expectedBalance: bigint,
  tolerance: bigint = BigInt(0)
) {
  await expect(wallet).toHaveTokenBalance(mint, expectedBalance, tolerance);
}