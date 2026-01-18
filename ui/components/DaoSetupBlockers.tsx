/*
 * Copyright (C) 2026 Spice Finance Inc.
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

'use client';

import { useState, useMemo } from 'react';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  createSetAuthorityInstruction,
  AuthorityType,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from '@solana/spl-token';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import toast from 'react-hot-toast';

import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useTransactionSigner } from '@/hooks/useTransactionSigner';
import { getConnection } from '@/lib/programs/utils';
import { truncateAddress } from '@/lib/dao-utils';

const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

interface DaoSetupBlockersProps {
  mintAuthorityReady: boolean;
  lpPositionReady: boolean;
  mintVault: string | null;
  adminWallet: string | null;
  tokenMint: string | null;
  poolAddress: string | null;
  poolType: 'damm' | 'dlmm' | null;
  onTransferComplete: () => void;
}

export default function DaoSetupBlockers({
  mintAuthorityReady,
  lpPositionReady,
  mintVault,
  adminWallet,
  tokenMint,
  poolAddress,
  poolType,
  onTransferComplete,
}: DaoSetupBlockersProps) {
  const { walletAddress } = usePrivyWallet();
  const { signTransaction, hasWallet } = useTransactionSigner();
  const connection = useMemo(() => getConnection(), []);

  const [transferringMint, setTransferringMint] = useState(false);
  const [transferringLp, setTransferringLp] = useState(false);

  const allReady = mintAuthorityReady && lpPositionReady;

  const handleTransferMintAuthority = async () => {
    if (!walletAddress || !tokenMint || !mintVault) {
      toast.error('Missing required data for transfer');
      return;
    }

    if (!hasWallet) {
      toast.error('No wallet connected');
      return;
    }

    setTransferringMint(true);
    const toastId = toast.loading('Preparing mint authority transfer...');

    try {
      // Build the setAuthority instruction
      const instruction = createSetAuthorityInstruction(
        new PublicKey(tokenMint),
        new PublicKey(walletAddress),
        AuthorityType.MintTokens,
        new PublicKey(mintVault),
        [],
        TOKEN_PROGRAM_ID
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const transaction = new Transaction().add(instruction);
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(walletAddress);

      toast.loading('Sign the transaction in your wallet...', { id: toastId });

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      toast.loading('Waiting for confirmation...', { id: toastId });
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      toast.success('Mint authority transferred successfully!', { id: toastId, duration: 5000 });
      onTransferComplete();

    } catch (error) {
      console.error('Mint authority transfer failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('rejected') || errorMessage.includes('cancelled')) {
        toast.error('Transaction cancelled by user', { id: toastId });
      } else {
        toast.error(`Transfer failed: ${errorMessage}`, { id: toastId });
      }
    } finally {
      setTransferringMint(false);
    }
  };

  const handleTransferLpPosition = async () => {
    if (!walletAddress || !poolAddress || !adminWallet) {
      toast.error('Missing required data for transfer');
      return;
    }

    if (poolType === 'dlmm') {
      // DLMM positions are more complex - show instructions for now
      toast.error(
        `DLMM LP transfer is not yet supported in the UI. Please transfer your position to ${truncateAddress(adminWallet)} manually.`,
        { duration: 10000 }
      );
      return;
    }

    // DAMM: Transfer the position NFT
    setTransferringLp(true);
    const toastId = toast.loading('Finding your LP position...');

    try {
      const cpAmm = new CpAmm(connection);
      const poolPubkey = new PublicKey(poolAddress);
      const userPubkey = new PublicKey(walletAddress);
      const adminPubkey = new PublicKey(adminWallet);

      // Find user's positions in the pool
      const userPositions = await cpAmm.getUserPositionByPool(poolPubkey, userPubkey);

      if (userPositions.length === 0) {
        toast.error('No LP position found in your wallet for this pool', { id: toastId });
        return;
      }

      const position = userPositions[0];
      const { positionNftAccount, positionState } = position;
      const positionNftMint = positionState.nftMint;

      toast.loading('Preparing transfer...', { id: toastId });

      // Determine which token program the NFT uses
      let tokenProgramId: PublicKey;
      try {
        await getAccount(connection, positionNftAccount, 'confirmed', TOKEN_2022_PROGRAM_ID);
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      } catch {
        tokenProgramId = TOKEN_PROGRAM_ID;
      }

      // Get or create admin's ATA for the NFT
      const adminAta = await getAssociatedTokenAddress(
        positionNftMint,
        adminPubkey,
        false,
        tokenProgramId
      );

      const transaction = new Transaction();

      // Check if ATA exists, create if not
      const adminAtaInfo = await connection.getAccountInfo(adminAta);
      if (!adminAtaInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            userPubkey,
            adminAta,
            adminPubkey,
            positionNftMint,
            tokenProgramId
          )
        );
      }

      // Add transfer instruction (amount = 1 for NFT)
      transaction.add(
        createTransferInstruction(
          positionNftAccount,
          adminAta,
          userPubkey,
          1,
          [],
          tokenProgramId
        )
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userPubkey;

      toast.loading('Sign the transaction in your wallet...', { id: toastId });

      const signedTx = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      toast.loading('Waiting for confirmation...', { id: toastId });
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      toast.success('LP position transferred successfully!', { id: toastId, duration: 5000 });
      onTransferComplete();

    } catch (error) {
      console.error('LP position transfer failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('rejected') || errorMessage.includes('cancelled')) {
        toast.error('Transaction cancelled by user', { id: toastId });
      } else {
        toast.error(`Transfer failed: ${errorMessage}`, { id: toastId });
      }
    } finally {
      setTransferringLp(false);
    }
  };

  if (allReady) {
    return null;
  }

  return (
    <div className="w-full max-w-[800px] mx-auto">
      <div className="bg-[#121212] border border-[#191919] rounded-[9px] p-6">
        <h3 className="text-xl font-semibold mb-2" style={{ color: '#E9E9E3' }}>
          Complete DAO Setup
        </h3>
        <p className="text-sm mb-6" style={{ color: '#6B6E71' }}>
          Before you can create proposals, complete these setup steps:
        </p>

        {/* Step 1: Mint Authority */}
        <div className={`border rounded-[6px] p-4 mb-4 ${mintAuthorityReady ? 'border-[#10B981] bg-[#10B981]/5' : 'border-[#292929]'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              mintAuthorityReady ? 'bg-[#10B981]' : 'bg-[#292929]'
            }`}>
              {mintAuthorityReady ? (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-semibold text-white">1</span>
              )}
            </div>

            <div className="flex-1">
              <h4 className="font-semibold mb-1" style={{ color: mintAuthorityReady ? '#10B981' : '#E9E9E3' }}>
                Transfer Mint Authority
              </h4>
              <p className="text-sm mb-3" style={{ color: '#6B6E71' }}>
                Transfer your token's mint authority to the DAO's mint multisig vault.
              </p>

              {!mintAuthorityReady && mintVault && (
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="text-xs px-3 py-1.5 bg-[#1a1a1a] rounded border border-[#292929]" style={{ color: '#6B6E71' }}>
                    Recipient: {truncateAddress(mintVault, 6)}
                  </div>
                  <button
                    onClick={handleTransferMintAuthority}
                    disabled={transferringMint}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                      transferringMint
                        ? 'bg-[#414346] cursor-not-allowed text-[#181818]'
                        : 'bg-[#DDDDD7] text-[#161616] hover:bg-[#E9E9E3] cursor-pointer'
                    }`}
                  >
                    {transferringMint ? 'Transferring...' : 'Transfer Mint Authority'}
                  </button>
                </div>
              )}

              {mintAuthorityReady && (
                <p className="text-sm" style={{ color: '#10B981' }}>
                  Mint authority has been transferred to the DAO.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: LP Position */}
        <div className={`border rounded-[6px] p-4 ${lpPositionReady ? 'border-[#10B981] bg-[#10B981]/5' : 'border-[#292929]'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              lpPositionReady ? 'bg-[#10B981]' : 'bg-[#292929]'
            }`}>
              {lpPositionReady ? (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="text-sm font-semibold text-white">2</span>
              )}
            </div>

            <div className="flex-1">
              <h4 className="font-semibold mb-1" style={{ color: lpPositionReady ? '#10B981' : '#E9E9E3' }}>
                Transfer LP Position
              </h4>
              <p className="text-sm mb-3" style={{ color: '#6B6E71' }}>
                Transfer your liquidity position to the DAO's admin wallet to manage decision market liquidity.
              </p>

              {!lpPositionReady && adminWallet && (
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="text-xs px-3 py-1.5 bg-[#1a1a1a] rounded border border-[#292929]" style={{ color: '#6B6E71' }}>
                    Recipient: {truncateAddress(adminWallet, 6)}
                  </div>
                  <button
                    onClick={handleTransferLpPosition}
                    disabled={transferringLp}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                      transferringLp
                        ? 'bg-[#414346] cursor-not-allowed text-[#181818]'
                        : 'bg-[#DDDDD7] text-[#161616] hover:bg-[#E9E9E3] cursor-pointer'
                    }`}
                  >
                    {transferringLp ? 'Processing...' : 'Transfer LP Position'}
                  </button>
                </div>
              )}

              {lpPositionReady && (
                <p className="text-sm" style={{ color: '#10B981' }}>
                  LP position has been transferred to the DAO.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Refresh button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={onTransferComplete}
            className="text-sm px-4 py-2 rounded-full border border-[#292929] hover:border-[#414346] transition"
            style={{ color: '#6B6E71' }}
          >
            Refresh Status
          </button>
        </div>
      </div>
    </div>
  );
}
