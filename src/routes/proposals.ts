import { Router } from 'express';
import { requireApiKey } from '../middleware/auth';
import ModeratorService from '../services/moderator.service';

const router = Router();

router.get('/', (req, res) => {
  const moderator = ModeratorService.getInstance();
  const proposals = moderator.proposals;
  
  const publicProposals = proposals.map((p, index) => ({
    id: index,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt,
    finalizedAt: p.finalizedAt,
  }));
  
  res.json({
    proposals: publicProposals,
  });
});

router.get('/:id', (req, res) => {
  const moderator = ModeratorService.getInstance();
  const id = parseInt(req.params.id);
  
  if (isNaN(id) || id < 0 || id >= moderator.proposals.length) {
    return res.status(404).json({ error: 'Proposal not found' });
  }
  
  const proposal = moderator.proposals[id];
  
  const response = {
    id,
    description: proposal.description,
    status: proposal.status,
    createdAt: proposal.createdAt,
    finalizedAt: proposal.finalizedAt,
    proposalStatus: proposal.status,
    proposalLength: proposal.proposalLength,
  };
  
  res.json(response);
});


router.post('/', requireApiKey, async (req, res, next) => {
  try {
    const moderator = ModeratorService.getInstance();
    
    res.status(501).json({ 
      error: 'Not implemented',
      message: 'Proposal creation endpoint not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/execute', requireApiKey, async (req, res, next) => {
  try {
    const moderator = ModeratorService.getInstance();
    const id = parseInt(req.params.id);
    
    if (isNaN(id) || id < 0 || id >= moderator.proposals.length) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    res.status(501).json({ 
      error: 'Not implemented',
      message: 'Proposal execution endpoint not yet implemented'
    });
  } catch (error) {
    next(error);
  }
});

export default router;