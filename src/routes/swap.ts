import { Router } from 'express';
import { requireApiKey } from '../middleware/auth';
import { getModerator } from '../services/moderator.service';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import { IAMM } from '../../app/types/amm.interface';

const router = Router();

/**
 * Helper function to get AMM from proposal
 * @param proposalId - The proposal ID
 * @param market - Either 'pass' or 'fail' to select the AMM
 * @returns The requested AMM instance
 */
function getAMM(proposalId: number, market: string): IAMM {
  const moderator = getModerator();
  
  if (proposalId < 0 || proposalId >= moderator.proposals.length) {
    throw new Error('Proposal not found');
  }
  
  const proposal = moderator.proposals[proposalId];
  
  // Use the proposal's getAMMs() method which handles initialization checks
  const [pAMM, fAMM] = proposal.getAMMs();
  
  if (market === 'pass') {
    return pAMM;
  } else if (market === 'fail') {
    return fAMM;
  } else {
    throw new Error('Invalid market type. Must be "pass" or "fail"');
  }
}

/**
 * Execute a swap on the specified AMM
 * POST /:id/:market/swap
 * 
 * Body:
 * - isBaseToQuote: boolean - Direction of swap (true: base->quote, false: quote->base)
 * - amountIn: string - Amount of input tokens to swap (as string to preserve precision)
 * - slippageBps?: number - Optional slippage tolerance in basis points (default: 50 = 0.5%)
 * - payer?: string - Optional payer public key for transaction fees
 */
router.post('/:id/:market/swap', requireApiKey, async (req, res, next) => {
  try {
    const proposalId = parseInt(req.params.id);
    const market = req.params.market;
    
    // Validate request body
    const { isBaseToQuote, amountIn, slippageBps, payer } = req.body;
    
    if (isBaseToQuote === undefined || amountIn === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['isBaseToQuote', 'amountIn'],
        optional: ['slippageBps', 'payer']
      });
    }
    
    // Validate isBaseToQuote is boolean
    if (typeof isBaseToQuote !== 'boolean') {
      return res.status(400).json({ 
        error: 'Invalid field type: isBaseToQuote must be a boolean'
      });
    }
    
    // Validate slippageBps if provided
    if (slippageBps !== undefined && (typeof slippageBps !== 'number' || slippageBps < 0)) {
      return res.status(400).json({ 
        error: 'Invalid slippageBps: must be a positive number'
      });
    }
    
    // Get the appropriate AMM
    const amm = getAMM(proposalId, market);
    
    // Convert amount to BN
    const amountInBN = new BN(amountIn);
    
    // Convert payer to PublicKey if provided
    const payerPubkey = payer ? new PublicKey(payer) : undefined;
    
    // Execute the swap
    await amm.swap(
      isBaseToQuote,
      amountInBN,
      slippageBps,
      payerPubkey
    );
    
    res.json({
      status: 'success',
      message: `Swap executed successfully on ${market} market`,
      details: {
        proposalId,
        market,
        direction: isBaseToQuote ? 'base->quote' : 'quote->base',
        amountIn: amountIn.toString(),
        slippageBps: slippageBps || 50
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get current price from the specified AMM
 * GET /:id/:market/price
 * 
 * Returns the current price as base/quote ratio
 */
router.get('/:id/:market/price', async (req, res, next) => {
  try {
    const proposalId = parseInt(req.params.id);
    const market = req.params.market;
    
    // Get the appropriate AMM
    const amm = getAMM(proposalId, market);
    
    // Fetch current price
    const price = await amm.fetchPrice();
    
    res.json({
      proposalId,
      market,
      price: price.toString(),
      baseMint: amm.baseMint.toString(),
      quoteMint: amm.quoteMint.toString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get AMM pool information
 * GET /:id/:market/info
 * 
 * Returns pool address and position information if available
 */
router.get('/:id/:market/info', async (req, res, next) => {
  try {
    const proposalId = parseInt(req.params.id);
    const market = req.params.market;
    
    // Get the appropriate AMM
    const amm = getAMM(proposalId, market);
    
    res.json({
      proposalId,
      market,
      state: amm.state,
      isFinalized: amm.isFinalized,
      baseMint: amm.baseMint.toString(),
      quoteMint: amm.quoteMint.toString(),
      baseDecimals: amm.baseDecimals,
      quoteDecimals: amm.quoteDecimals,
      pool: amm.pool?.toString() || null,
      position: amm.position?.toString() || null,
      positionNft: amm.positionNft?.toString() || null
    });
  } catch (error) {
    next(error);
  }
});

export default router;