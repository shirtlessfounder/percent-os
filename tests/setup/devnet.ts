import { Connection, Keypair } from '@solana/web3.js';
import { SPLTokenService } from '../../app/services/spl-token.service';
import { ExecutionService } from '../../app/services/execution.service';
import { beforeAll, afterAll } from 'vitest';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load test environment
dotenv.config({ path: '.env.test' });

// Global test configuration
export const TEST_CONFIG = {
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  commitment: process.env.SOLANA_COMMITMENT as 'confirmed' | 'finalized' || 'confirmed',
  airdropAmount: parseInt(process.env.AIRDROP_AMOUNT || '10000000000'), // 10 SOL
  testTimeout: parseInt(process.env.TEST_TIMEOUT || '30000'),
  cleanupOnFailure: process.env.CLEANUP_ON_FAILURE === 'true'
};

// Global connection instance
export let connection: Connection;

// Test wallets
export let authorityWallet: Keypair;
export let aliceWallet: Keypair;
export let bobWallet: Keypair;

// Global service instances
export let tokenService: SPLTokenService;
export let executionService: ExecutionService;

/**
 * Load or generate a test wallet
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
 * Initialize global test setup
 */
export async function setupTestEnvironment() {
  console.log('🔧 Setting up test environment...');
  console.log(`   RPC: ${TEST_CONFIG.rpcUrl}`);
  console.log(`   Commitment: ${TEST_CONFIG.commitment}`);
  
  // Initialize connection
  connection = new Connection(TEST_CONFIG.rpcUrl, {
    commitment: TEST_CONFIG.commitment,
    confirmTransactionInitialTimeout: TEST_CONFIG.testTimeout
  });
  
  // Load test wallets
  authorityWallet = loadOrGenerateWallet('authority');
  aliceWallet = loadOrGenerateWallet('alice');
  bobWallet = loadOrGenerateWallet('bob');
  
  console.log('📝 Test wallets:');
  console.log(`   Authority: ${authorityWallet.publicKey.toBase58()}`);
  console.log(`   Alice: ${aliceWallet.publicKey.toBase58()}`);
  console.log(`   Bob: ${bobWallet.publicKey.toBase58()}`);
  
  // Initialize services
  executionService = new ExecutionService({
    rpcEndpoint: TEST_CONFIG.rpcUrl,
    commitment: TEST_CONFIG.commitment,
    maxRetries: 3
  });
  
  tokenService = new SPLTokenService(connection, TEST_CONFIG.rpcUrl);
  
  // Check connection
  try {
    const version = await connection.getVersion();
    console.log(`✅ Connected to Solana ${version['solana-core']}`);
  } catch (error) {
    console.error('❌ Failed to connect to Solana:', error);
    throw error;
  }
}

// Run setup once before all tests in this worker
beforeAll(async () => {
  await setupTestEnvironment();
});