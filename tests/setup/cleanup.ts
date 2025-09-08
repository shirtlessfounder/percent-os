import { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createCloseAccountInstruction, getAccount } from '@solana/spl-token';
import { connection } from './devnet';

/**
 * Track accounts created during tests for cleanup
 */
const createdAccounts: Set<PublicKey> = new Set();
const createdMints: Set<PublicKey> = new Set();

/**
 * Register an account for cleanup
 */
export function registerAccountForCleanup(account: PublicKey) {
  createdAccounts.add(account);
}

/**
 * Register a mint for tracking (mints cannot be closed)
 */
export function registerMintForTracking(mint: PublicKey) {
  createdMints.add(mint);
}

/**
 * Close a single token account to recover rent
 */
export async function closeTokenAccount(
  account: PublicKey,
  owner: Keypair,
  destination: PublicKey = owner.publicKey
): Promise<string | null> {
  try {
    // Check if account exists and has zero balance
    const accountInfo = await getAccount(connection, account);
    
    if (accountInfo.amount > 0) {
      console.warn(`⚠️  Cannot close account ${account.toBase58()}: has balance ${accountInfo.amount}`);
      return null;
    }
    
    const transaction = new Transaction().add(
      createCloseAccountInstruction(
        account,
        destination,
        owner.publicKey,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [owner],
      { commitment: 'confirmed' }
    );
    
    console.log(`✅ Closed account ${account.toBase58().slice(0, 8)}...`);
    return signature;
  } catch (error: any) {
    if (error.message?.includes('AccountNotFound')) {
      // Account already closed or doesn't exist
      return null;
    }
    console.error(`❌ Failed to close account ${account.toBase58()}:`, error.message);
    return null;
  }
}

/**
 * Batch close multiple token accounts
 */
export async function batchCloseAccounts(
  accounts: PublicKey[],
  owner: Keypair,
  destination: PublicKey = owner.publicKey
): Promise<number> {
  const instructions: TransactionInstruction[] = [];
  const validAccounts: PublicKey[] = [];
  
  // Check each account and build instructions
  for (const account of accounts) {
    try {
      const accountInfo = await getAccount(connection, account);
      
      if (accountInfo.amount === BigInt(0)) {
        instructions.push(
          createCloseAccountInstruction(
            account,
            destination,
            owner.publicKey,
            [],
            TOKEN_PROGRAM_ID
          )
        );
        validAccounts.push(account);
      }
    } catch (error) {
      // Account doesn't exist, skip
    }
  }
  
  if (instructions.length === 0) {
    return 0;
  }
  
  // Batch transactions (max 10 instructions per transaction for safety)
  const batchSize = 10;
  let closedCount = 0;
  
  for (let i = 0; i < instructions.length; i += batchSize) {
    const batch = instructions.slice(i, i + batchSize);
    const transaction = new Transaction().add(...batch);
    
    try {
      await sendAndConfirmTransaction(
        connection,
        transaction,
        [owner],
        { commitment: 'confirmed' }
      );
      closedCount += batch.length;
    } catch (error) {
      console.error(`❌ Failed to close batch of accounts:`, error);
    }
  }
  
  console.log(`✅ Closed ${closedCount} of ${accounts.length} accounts`);
  return closedCount;
}

/**
 * Clean up all tracked accounts
 */
export async function cleanupAllAccounts(owner: Keypair): Promise<void> {
  // Skip cleanup on devnet unless explicitly enabled
  if (!process.env.ENABLE_CLEANUP) {
    console.log('🏃 Skipping cleanup (devnet mode)');
    createdAccounts.clear();
    return;
  }
  
  if (createdAccounts.size === 0) {
    return;
  }
  
  console.log(`🧹 Cleaning up ${createdAccounts.size} accounts...`);
  const accounts = Array.from(createdAccounts);
  const closed = await batchCloseAccounts(accounts, owner);
  
  // Clear the set
  createdAccounts.clear();
  
  console.log(`📊 Cleanup summary: ${closed} accounts closed`);
  if (createdMints.size > 0) {
    console.log(`ℹ️  ${createdMints.size} mints created (cannot be closed, ~0.0014 SOL each)`);
  }
}

/**
 * Force cleanup with elevated permissions (if needed)
 */
export async function forceCleanup(owner: Keypair): Promise<void> {
  console.log('🔨 Force cleanup initiated...');
  
  // Get all token accounts owned by the wallet
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    owner.publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );
  
  const accounts = tokenAccounts.value
    .filter(acc => {
      const amount = acc.account.data.parsed.info.tokenAmount.amount;
      return amount === '0';
    })
    .map(acc => acc.pubkey);
  
  if (accounts.length > 0) {
    console.log(`Found ${accounts.length} empty token accounts to close`);
    await batchCloseAccounts(accounts, owner);
  }
}

/**
 * Log cleanup statistics
 */
export function getCleanupStats() {
  return {
    pendingAccounts: createdAccounts.size,
    trackedMints: createdMints.size,
    estimatedRentLocked: createdMints.size * 0.00144 // SOL per mint
  };
}

/**
 * Reset cleanup tracking (use between test suites)
 */
export function resetCleanupTracking() {
  createdAccounts.clear();
  createdMints.clear();
}