/*
 * Copyright (C) 2025 Spice Finance Inc.
 *
 * This file is part of Z Combinator.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * DAO funding wallet address - receives 0.11 SOL payment for DAO creation
 */
export const FUNDING_WALLET = new PublicKey('83PbZortE6imDzJcZrd5eGS42zbSAskJw7eP26GaJbqE');

/**
 * Amount of SOL required to create a DAO
 */
export const FUNDING_AMOUNT_SOL = 0.11;

/**
 * Build a funding transaction for DAO creation
 * @param fromPubkey - The wallet paying the funding fee
 * @param recentBlockhash - Recent blockhash for the transaction
 * @returns Transaction ready to be signed
 */
export function buildFundingTransaction(
  fromPubkey: PublicKey,
  recentBlockhash: string
): Transaction {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: FUNDING_WALLET,
      lamports: Math.floor(FUNDING_AMOUNT_SOL * LAMPORTS_PER_SOL),
    })
  );

  transaction.recentBlockhash = recentBlockhash;
  transaction.feePayer = fromPubkey;

  return transaction;
}

/**
 * Create signed_hash for zcombinator API authentication.
 * Signs a human-readable message containing the SHA-256 hash of the request body.
 *
 * Note: We sign a human-readable message (not raw bytes) because some wallets
 * like Phantom reject signing raw binary data that could be mistaken for transactions.
 *
 * @param body - Request body object (without signed_hash field)
 * @param signMessage - Wallet's signMessage function
 * @returns Base58-encoded signature
 */
export async function createSignedHash(
  body: Record<string, unknown>,
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<string> {
  // Create SHA-256 hash of the JSON body
  const jsonString = JSON.stringify(body);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert hash to hex string for human-readable message
  const hashHex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Create human-readable message that users can verify
  // This prevents wallets from rejecting raw binary data
  const message = `Combinator Authentication\n\nSign this message to verify your request.\n\nRequest hash: ${hashHex}`;
  const messageBytes = encoder.encode(message);

  // Sign the human-readable message
  const signatureBytes = await signMessage(messageBytes);

  // Convert signature to base58
  return bs58.encode(signatureBytes);
}

/**
 * Validate that a string is a valid Solana address
 * @param address - String to validate
 * @returns true if valid Solana address format
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Truncate a Solana address for display
 * @param address - Full address string
 * @param chars - Number of characters to show at start and end (default 4)
 * @returns Truncated address like "ABC1...XYZ9"
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}
