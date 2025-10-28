import { Request } from 'express';

/**
 * Parse and validate proposal ID from route params
 * @param req - Express request object
 * @returns Validated proposal ID
 * @throws Error if ID is invalid
 */
export function getProposalId(req: Request): number {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id < 0) {
    throw new Error('Invalid proposal ID');
  }
  return id;
}