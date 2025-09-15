import { Keypair, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
// Remove dotenv.config() here - it should be loaded in server.test.ts before imports

export interface TestWallets {
  authority: Keypair;
  alice: Keypair;
  bob: Keypair;
  aelix: Keypair;
  dylan: Keypair;
}

export interface TestModeConfig {
  rpcUrl: string;
  wallets: TestWallets;
  connection: Connection;
}

/**
 * Load or generate a test wallet (reused from tests/setup/devnet.ts)
 */
function loadOrGenerateWallet(name: string): Keypair {
  // Generate deterministic wallet from seed
  const seed = new Uint8Array(32);
  const encoder = new TextEncoder();
  const nameBytes = encoder.encode(name + '-test-wallet');
  for (let i = 0; i < Math.min(nameBytes.length, 32); i++) {
    seed[i] = nameBytes[i];
  }
  return Keypair.fromSeed(seed);
}

/**
 * Get test mode configuration
 */
export function getTestModeConfig(): TestModeConfig {
  // Always use devnet RPC from .env.test for test server
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  
  // Load test wallets (same as in tests/setup/devnet.ts)
  // Load aelix wallet from environment variable if available
  let aelixWallet: Keypair;
  if (process.env.TEST_WALLET_PRIVATE_KEY) {
    try {
      const privateKeyBytes = bs58.decode(process.env.TEST_WALLET_PRIVATE_KEY);
      aelixWallet = Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
      console.warn('⚠️ Failed to load TEST_WALLET_PRIVATE_KEY, generating deterministic wallet:', error);
      aelixWallet = loadOrGenerateWallet('aelix');
    }
  } else {
    console.warn('⚠️ No TEST_WALLET_PRIVATE_KEY, generating deterministic wallet');
    aelixWallet = loadOrGenerateWallet('aelix');
  }

  // Load Dylan's wallet from environment variable if available
  let dylanWallet: Keypair;
  if (process.env.DYLAN_WALLET_PRIVATE_KEY) {
    try {
      const privateKeyBytes = bs58.decode(process.env.DYLAN_WALLET_PRIVATE_KEY);
      dylanWallet = Keypair.fromSecretKey(privateKeyBytes);
    } catch (error) {
      console.warn('⚠️ Failed to load DYLAN_WALLET_PRIVATE_KEY, generating deterministic wallet:', error);
      dylanWallet = loadOrGenerateWallet('dylan');
    }
  } else {
    console.warn('⚠️ No DYLAN_WALLET_PRIVATE_KEY, generating deterministic wallet');
    dylanWallet = loadOrGenerateWallet('dylan');
  }

  const wallets: TestWallets = {
    authority: loadOrGenerateWallet('authority'),
    alice: loadOrGenerateWallet('alice'),
    bob: loadOrGenerateWallet('bob'),
    aelix: aelixWallet,
    dylan: dylanWallet
  };

  // Create connection with confirmed commitment
  const connection = new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 30000
  });

  return {
    rpcUrl,
    wallets,
    connection
  };
}

/**
 * Log test mode configuration
 */
export function logTestModeInfo(config: TestModeConfig): void {
  console.log('\n🧪 TEST MODE ACTIVE');
  console.log('═══════════════════════════════════════════');
  console.log(`📡 RPC URL: ${config.rpcUrl}`);
  console.log('\n📝 Test Wallets:');
  console.log(`   Authority: ${config.wallets.authority.publicKey.toBase58()}`);
  console.log(`   Alice:     ${config.wallets.alice.publicKey.toBase58()}`);
  console.log(`   Bob:       ${config.wallets.bob.publicKey.toBase58()}`);
  console.log(`   Aelix:     ${config.wallets.aelix.publicKey.toBase58()}`);
  console.log(`   Dylan:     ${config.wallets.dylan.publicKey.toBase58()}`);
  console.log('═══════════════════════════════════════════\n');
}