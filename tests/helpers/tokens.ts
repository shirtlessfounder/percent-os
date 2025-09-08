import { PublicKey, Keypair } from '@solana/web3.js';
import { 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint
} from '@solana/spl-token';
import { connection, tokenService, authorityWallet } from '../setup/devnet';
import { registerAccountForCleanup, registerMintForTracking } from '../setup/cleanup';
import { TEST_TOKENS } from '../setup/fixtures';

/**
 * Create a test SPL token
 */
export async function createTestToken(
  decimals: number = 6,
  mintAuthority: Keypair = authorityWallet
): Promise<PublicKey> {
  console.log(`🪙 Creating test token with ${decimals} decimals...`);
  
  const mint = await tokenService.createMint(
    decimals,
    mintAuthority.publicKey,
    mintAuthority
  );
  
  console.log(`✅ Created token mint: ${mint.toBase58()}`);
  registerMintForTracking(mint);
  
  return mint;
}

/**
 * Mint tokens to a wallet
 */
export async function mintTestTokens(
  mint: PublicKey,
  recipient: PublicKey,
  amount: bigint,
  mintAuthority: Keypair = authorityWallet
): Promise<PublicKey> {
  console.log(`🏭 Minting ${amount} tokens to ${recipient.toBase58().slice(0, 8)}...`);
  
  // Get or create associated token account
  const recipientATA = await getOrCreateAssociatedTokenAccount(
    connection,
    mintAuthority,
    mint,
    recipient
  );
  
  registerAccountForCleanup(recipientATA.address);
  
  // Mint tokens
  // Convert bigint to number for mintTo (safe for test amounts)
  await mintTo(
    connection,
    mintAuthority,
    mint,
    recipientATA.address,
    mintAuthority,
    Number(amount)
  );
  
  console.log(`✅ Minted ${amount} tokens to ${recipientATA.address.toBase58()}`);
  return recipientATA.address;
}

/**
 * Create token accounts for multiple users
 */
export async function createTokenAccounts(
  mint: PublicKey,
  owners: PublicKey[],
  payer: Keypair = authorityWallet
): Promise<Map<string, PublicKey>> {
  const accounts = new Map<string, PublicKey>();
  
  console.log(`📦 Creating token accounts for ${owners.length} users...`);
  
  for (const owner of owners) {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      owner
    );
    
    accounts.set(owner.toBase58(), ata.address);
    registerAccountForCleanup(ata.address);
  }
  
  console.log(`✅ Created ${accounts.size} token accounts`);
  return accounts;
}

/**
 * Get token balance for an account
 */
export async function getTokenBalance(tokenAccount: PublicKey): Promise<bigint> {
  try {
    const account = await getAccount(connection, tokenAccount);
    return account.amount;
  } catch (error) {
    return BigInt(0);
  }
}

/**
 * Get token balance for a wallet's associated token account
 */
export async function getWalletTokenBalance(
  wallet: PublicKey,
  mint: PublicKey
): Promise<bigint> {
  try {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      authorityWallet, // payer doesn't matter for read
      mint,
      wallet,
      false // don't create if doesn't exist
    );
    return ata.amount;
  } catch (error) {
    return BigInt(0);
  }
}

/**
 * Create a test token pair (base and quote)
 */
export async function createTestTokenPair(
  authority: Keypair = authorityWallet
): Promise<{ baseMint: PublicKey; quoteMint: PublicKey }> {
  console.log('🎭 Creating test token pair...');
  
  const baseMint = await createTestToken(TEST_TOKENS.TEST_TOKEN.decimals, authority);
  const quoteMint = await createTestToken(TEST_TOKENS.SOL.decimals, authority);
  
  console.log(`✅ Token pair created:`);
  console.log(`   Base: ${baseMint.toBase58()}`);
  console.log(`   Quote: ${quoteMint.toBase58()}`);
  
  return { baseMint, quoteMint };
}

/**
 * Setup test tokens for multiple users
 */
export async function setupTestTokensForUsers(
  mint: PublicKey,
  users: Map<string, PublicKey>,
  amountEach: bigint,
  authority: Keypair = authorityWallet
): Promise<Map<string, PublicKey>> {
  const accounts = new Map<string, PublicKey>();
  
  console.log(`💰 Setting up tokens for ${users.size} users...`);
  
  for (const [name, userPubkey] of users.entries()) {
    const tokenAccount = await mintTestTokens(mint, userPubkey, amountEach, authority);
    accounts.set(name, tokenAccount);
    console.log(`   ${name}: ${amountEach} tokens`);
  }
  
  return accounts;
}

/**
 * Display token balances for multiple accounts
 */
export async function displayTokenBalances(
  accounts: Map<string, PublicKey>,
  label: string = 'Token Balances'
): Promise<void> {
  console.log(`\n${label}:`);
  
  for (const [name, account] of accounts.entries()) {
    const balance = await getTokenBalance(account);
    console.log(`  ${name}: ${balance} tokens`);
  }
}

/**
 * Get mint info
 */
export async function getMintInfo(mint: PublicKey) {
  const mintInfo = await getMint(connection, mint);
  return {
    supply: mintInfo.supply,
    decimals: mintInfo.decimals,
    mintAuthority: mintInfo.mintAuthority,
    freezeAuthority: mintInfo.freezeAuthority,
    isInitialized: mintInfo.isInitialized
  };
}

/**
 * Verify token account ownership
 */
export async function verifyTokenAccountOwner(
  tokenAccount: PublicKey,
  expectedOwner: PublicKey
): Promise<boolean> {
  try {
    const account = await getAccount(connection, tokenAccount);
    return account.owner.equals(expectedOwner);
  } catch (error) {
    return false;
  }
}