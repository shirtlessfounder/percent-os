import { Connection } from '@solana/web3.js';

/**
 * Network enum to specify which Solana network to use
 */
export enum Network {
  MAINNET = 'mainnet',
  DEVNET = 'devnet'
}

/**
 * Determine the Solana network from a Connection object
 * @param connection - Solana Connection instance
 * @returns Network enum value (MAINNET or DEVNET)
 */
export function getNetworkFromConnection(connection: Connection): Network {
  return connection.rpcEndpoint.includes('devnet') ? Network.DEVNET : Network.MAINNET;
}