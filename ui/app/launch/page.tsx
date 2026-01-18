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
import { useRouter } from 'next/navigation';
import { PublicKey } from '@solana/web3.js';
import toast from 'react-hot-toast';

import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useTransactionSigner } from '@/hooks/useTransactionSigner';
import { getConnection } from '@/lib/programs/utils';
import { api } from '@/lib/api';
import {
  buildFundingTransaction,
  createSignedHash,
  isValidSolanaAddress,
  FUNDING_AMOUNT_SOL,
} from '@/lib/dao-utils';
import ExploreHeader from '@/components/ExploreHeader';

type SubmitStep = 'idle' | 'funding' | 'signing' | 'creating';

export default function CreateDaoPage() {
  const router = useRouter();
  const { ready, authenticated, walletAddress, login } = usePrivyWallet();
  const { signTransaction, signMessage, hasWallet } = useTransactionSigner();
  const connection = useMemo(() => getConnection(), []);

  // Form state
  const [daoName, setDaoName] = useState('');
  const [tokenMint, setTokenMint] = useState('');
  const [poolAddress, setPoolAddress] = useState('');

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState<SubmitStep>('idle');

  // Validation
  const nameError = useMemo(() => {
    if (!daoName) return null;
    if (daoName.length > 32) return 'Name must be 32 characters or less';
    if (!/^[a-zA-Z0-9_-]+$/.test(daoName)) return 'Name can only contain letters, numbers, hyphens, and underscores';
    return null;
  }, [daoName]);

  const tokenMintError = useMemo(() => {
    if (!tokenMint) return null;
    if (!isValidSolanaAddress(tokenMint)) return 'Invalid Solana address';
    return null;
  }, [tokenMint]);

  const poolAddressError = useMemo(() => {
    if (!poolAddress) return null;
    if (!isValidSolanaAddress(poolAddress)) return 'Invalid Solana address';
    return null;
  }, [poolAddress]);

  const isFormValid = useMemo(() => {
    return (
      daoName.trim() &&
      !nameError &&
      tokenMint.trim() &&
      !tokenMintError &&
      poolAddress.trim() &&
      !poolAddressError
    );
  }, [daoName, nameError, tokenMint, tokenMintError, poolAddress, poolAddressError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!walletAddress) {
      login();
      return;
    }

    if (!isFormValid) {
      toast.error('Please fix form errors before submitting');
      return;
    }

    if (!hasWallet) {
      toast.error('No Solana wallet found');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Preparing DAO creation...');

    try {
      // Step 1: Build and send funding transaction
      setSubmitStep('funding');
      toast.loading(`Sign the funding transaction (${FUNDING_AMOUNT_SOL} SOL)...`, { id: toastId });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const fundingTx = buildFundingTransaction(new PublicKey(walletAddress), blockhash);

      // Sign and send transaction
      const signedTx = await signTransaction(fundingTx);
      const fundingSignature = await connection.sendRawTransaction(signedTx.serialize());

      toast.loading('Waiting for confirmation...', { id: toastId });

      // Wait for confirmation
      await connection.confirmTransaction({
        signature: fundingSignature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');

      // Step 2: Sign message for API authentication
      setSubmitStep('signing');
      toast.loading('Sign the message to verify ownership...', { id: toastId });

      const requestBody = {
        wallet: walletAddress,
        name: daoName.trim(),
        token_mint: tokenMint.trim(),
        pool_address: poolAddress.trim(),
        treasury_cosigner: walletAddress,
        funding_signature: fundingSignature,
      };

      const signedHash = await createSignedHash(requestBody, signMessage);

      // Step 3: Create the DAO
      setSubmitStep('creating');
      toast.loading('Creating DAO on-chain...', { id: toastId });

      const result = await api.createParentDao({
        ...requestBody,
        signed_hash: signedHash,
      });

      toast.success(`DAO "${daoName}" created successfully!`, { id: toastId, duration: 5000 });

      // Navigate to the new DAO page
      const daoSlug = daoName.trim().toLowerCase();
      router.push(`/${daoSlug}`);

    } catch (error) {
      console.error('DAO creation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('rejected') || errorMessage.includes('cancelled')) {
        toast.error('Transaction cancelled by user', { id: toastId });
      } else {
        toast.error(`Failed to create DAO: ${errorMessage}`, { id: toastId });
      }
    } finally {
      setIsSubmitting(false);
      setSubmitStep('idle');
    }
  };

  const getButtonText = () => {
    if (!authenticated) return 'Connect Wallet';
    if (!isFormValid) return 'Fill Required Fields';
    if (isSubmitting) {
      switch (submitStep) {
        case 'funding':
          return 'Sign Funding Transaction...';
        case 'signing':
          return 'Sign Message...';
        case 'creating':
          return 'Creating DAO...';
        default:
          return 'Processing...';
      }
    }
    return 'Create DAO';
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <ExploreHeader />

      <main className="flex justify-center">
        <div className="w-full max-w-[600px] pt-8 px-4 pb-16">
          {/* Page heading */}
          <h2 className="text-2xl font-medium mb-2" style={{ color: '#E9E9E3' }}>
            Create DAO
          </h2>
          <p className="text-sm mb-8" style={{ color: '#6B6E71' }}>
            Set up a new DAO with your existing token and liquidity pool.
          </p>

          <form onSubmit={handleSubmit}>
            {/* DAO Name */}
            <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5 mb-4">
              <label className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase mb-3 block" style={{ color: '#DDDDD7' }}>
                DAO Name*
              </label>
              <input
                type="text"
                value={daoName}
                onChange={(e) => setDaoName(e.target.value)}
                placeholder="MyDAO"
                maxLength={32}
                disabled={isSubmitting}
                className="w-full h-[48px] px-3 bg-[#2a2a2a] rounded-[6px] text-white placeholder-gray-600 focus:outline-none border border-[#191919] text-lg font-ibm-plex-mono"
                style={{ fontFamily: 'IBM Plex Mono, monospace' }}
              />
              {nameError && (
                <p className="text-sm mt-2" style={{ color: '#EF4444' }}>{nameError}</p>
              )}
              <p className="text-xs mt-2" style={{ color: '#6B6E71' }}>
                Max 32 characters. Will be used as the URL slug.
              </p>
            </div>

            {/* Token Mint */}
            <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5 mb-4">
              <label className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase mb-3 block" style={{ color: '#DDDDD7' }}>
                Token Mint*
              </label>
              <input
                type="text"
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                placeholder="So11111111111111111111111111111111111111112"
                disabled={isSubmitting}
                className="w-full h-[48px] px-3 bg-[#2a2a2a] rounded-[6px] text-white placeholder-gray-600 focus:outline-none border border-[#191919] text-sm font-ibm-plex-mono"
                style={{ fontFamily: 'IBM Plex Mono, monospace' }}
              />
              {tokenMintError && (
                <p className="text-sm mt-2" style={{ color: '#EF4444' }}>{tokenMintError}</p>
              )}
              <p className="text-xs mt-2" style={{ color: '#6B6E71' }}>
                Your token's mint address. Must be an SPL Token (not Token-2022).
              </p>
            </div>

            {/* Pool Address */}
            <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5 mb-6">
              <label className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase mb-3 block" style={{ color: '#DDDDD7' }}>
                Pool Address*
              </label>
              <input
                type="text"
                value={poolAddress}
                onChange={(e) => setPoolAddress(e.target.value)}
                placeholder="Pool111111111111111111111111111111111111111"
                disabled={isSubmitting}
                className="w-full h-[48px] px-3 bg-[#2a2a2a] rounded-[6px] text-white placeholder-gray-600 focus:outline-none border border-[#191919] text-sm font-ibm-plex-mono"
                style={{ fontFamily: 'IBM Plex Mono, monospace' }}
              />
              {poolAddressError && (
                <p className="text-sm mt-2" style={{ color: '#EF4444' }}>{poolAddressError}</p>
              )}
              <p className="text-xs mt-2" style={{ color: '#6B6E71' }}>
                Meteora pool address. Must be DAMMv2 (not DLMM).
              </p>
            </div>

            {/* Cost info */}
            <div className="bg-[#1a1a1a] border border-[#292929] rounded-[9px] py-3 px-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#6B6E71' }}>Creation Fee</span>
                <span className="text-sm font-medium" style={{ color: '#DDDDD7' }}>{FUNDING_AMOUNT_SOL} SOL</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || (authenticated && !isFormValid)}
              className={`w-full h-[56px] rounded-full font-semibold transition flex items-center justify-center gap-2 uppercase font-ibm-plex-mono ${
                isSubmitting || (authenticated && !isFormValid)
                  ? 'bg-[#414346] cursor-not-allowed text-[#181818]'
                  : 'bg-[#DDDDD7] text-[#161616] cursor-pointer hover:bg-[#E9E9E3]'
              }`}
            >
              {isSubmitting && (
                <div className="w-5 h-5 border-2 border-[#181818] border-t-transparent rounded-full animate-spin" />
              )}
              {getButtonText()}
            </button>

            {/* Info text */}
            <p className="text-xs text-center mt-4" style={{ color: '#6B6E71' }}>
              After creating your DAO, you'll need to transfer mint authority and LP position to complete setup.
            </p>

            {/* Help text */}
            <p className="text-xs text-center mt-6" style={{ color: '#6B6E71' }}>
              Need help? Reach out to{' '}
              <a href="https://x.com/handsdiff" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#9B9E9F]">@handsdiff on X</a>
              {' '}or{' '}
              <a href="https://t.me/handsdiff" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#9B9E9F]">Telegram</a>
              {' '}for custom assistance.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
