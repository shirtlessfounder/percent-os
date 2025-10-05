import { Router } from 'express';
import { Connection } from '@solana/web3.js';
import { getNetworkFromConnection } from '../../app/utils/network';

const router = Router();

/**
 * Get network information
 * GET /network
 * 
 * Returns whether we're on devnet or mainnet
 */
router.get('/', async (_req, res, next) => {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://bernie-zo3q7f-fast-mainnet.helius-rpc.com';
    const connection = new Connection(rpcUrl);

    // Determine network from connection using utility
    const network = getNetworkFromConnection(connection);
    
    res.json({
      network
    });
  } catch (error) {
    next(error);
  }
});

export default router;