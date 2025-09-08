import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { connection } from '../setup/devnet';

/**
 * Request an airdrop of SOL to a wallet
 * IMPORTANT: 0.1 SOL MAX to avoid rate limits!
 */
export async function airdrop(
  wallet: PublicKey,
  lamports: number = 0.1 * LAMPORTS_PER_SOL  // Default to 0.1 SOL
): Promise<string> {
  // HARD CAP at 0.1 SOL
  const MAX_AIRDROP = 0.1 * LAMPORTS_PER_SOL;
  const requestAmount = Math.min(lamports, MAX_AIRDROP);
  
  console.log(`💰 Requesting airdrop of ${requestAmount / LAMPORTS_PER_SOL} SOL to ${wallet.toBase58().slice(0, 8)}...`);
  
  try {
    const signature = await connection.requestAirdrop(wallet, requestAmount);
    
    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, 'confirmed');
    
    console.log(`✅ Airdrop confirmed: ${signature}`);
    return signature;
  } catch (error: any) {
    // Handle rate limiting
    if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
      console.log('⏳ Rate limited, waiting 10 seconds...');
      await sleep(10000);
      return airdrop(wallet, lamports); // Retry
    }
    
    throw new Error(`Airdrop failed: ${error.message}`);
  }
}

/**
 * Ensure a wallet has a minimum balance
 */
export async function ensureMinBalance(
  wallet: PublicKey,
  minLamports: number = 0.1 * LAMPORTS_PER_SOL  // Default 0.1 SOL
): Promise<void> {
  const balance = await connection.getBalance(wallet);
  
  if (balance < minLamports) {
    const needed = minLamports - balance;
    console.log(`Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    console.log(`Minimum required: ${minLamports / LAMPORTS_PER_SOL} SOL`);
    
    // Request only what's needed (capped at 0.1 SOL)
    await airdrop(wallet, needed);
  } else {
    console.log(`✅ Wallet has sufficient balance: ${balance / LAMPORTS_PER_SOL} SOL`);
  }
}

/**
 * Fund multiple wallets with SOL
 */
export async function fundWallets(
  wallets: PublicKey[],
  lamportsEach: number = LAMPORTS_PER_SOL
): Promise<void> {
  console.log(`💰 Funding ${wallets.length} wallets...`);
  
  for (const wallet of wallets) {
    await ensureMinBalance(wallet, lamportsEach);
    // Add delay to avoid rate limiting
    await sleep(1000);
  }
  
  console.log('✅ All wallets funded');
}

/**
 * Get the SOL balance of a wallet
 */
export async function getBalance(wallet: PublicKey): Promise<number> {
  const balance = await connection.getBalance(wallet);
  return balance;
}

/**
 * Display balance in a readable format
 */
export async function displayBalance(wallet: PublicKey, label: string = 'Wallet'): Promise<void> {
  const balance = await getBalance(wallet);
  console.log(`${label}: ${balance / LAMPORTS_PER_SOL} SOL (${wallet.toBase58().slice(0, 8)}...)`);
}

/**
 * Display balances for multiple wallets
 */
export async function displayBalances(wallets: Map<string, PublicKey>): Promise<void> {
  console.log('💼 Wallet Balances:');
  for (const [label, wallet] of wallets.entries()) {
    await displayBalance(wallet, `  ${label}`);
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch airdrop with retry logic
 */
export async function batchAirdrop(
  wallets: PublicKey[],
  lamportsEach: number = LAMPORTS_PER_SOL,
  maxRetries: number = 3
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  for (const wallet of wallets) {
    let retries = 0;
    let success = false;
    
    while (retries < maxRetries && !success) {
      try {
        const signature = await airdrop(wallet, lamportsEach);
        results.set(wallet.toBase58(), signature);
        success = true;
      } catch (error: any) {
        retries++;
        if (retries < maxRetries) {
          console.log(`⚠️  Retry ${retries}/${maxRetries} for ${wallet.toBase58().slice(0, 8)}...`);
          await sleep(5000 * retries); // Exponential backoff
        } else {
          console.error(`❌ Failed to airdrop to ${wallet.toBase58()}: ${error.message}`);
          results.set(wallet.toBase58(), 'FAILED');
        }
      }
    }
    
    // Delay between airdrops to avoid rate limiting
    if (wallets.indexOf(wallet) < wallets.length - 1) {
      await sleep(2000);
    }
  }
  
  return results;
}