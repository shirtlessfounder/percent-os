const { Keypair } = require('@solana/web3.js');
const fs = require('fs');

// Read the JSON keypair file
const keypairPath = process.argv[2] || './wallet.json';

try {
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
  const publicKey = keypair.publicKey.toBase58();

  console.log('Public Key:', publicKey);
} catch (error) {
  console.error('Error reading keypair file:', error.message);
  console.log('Usage: node json-to-publickey.js [path-to-keypair.json]');
}