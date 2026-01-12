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

'use client';

import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { useDaoReadiness } from '@/hooks/useDaoReadiness';
import { useTokenContext } from '@/providers/TokenContext';
import Header from '@/components/Header';
import { ExternalLink, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Truncate an address for display
 */
function truncateAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Get Squads URL for a vault address
 */
function getSquadsUrl(vaultAddress: string): string {
  return `https://app.squads.so/squads/${vaultAddress}/home`;
}

export default function InfoPage() {
  const {
    tokenSlug,
    poolAddress,
    baseMint,
    baseDecimals,
    tokenSymbol,
    icon,
    isFutarchy,
    daoPda,
    poolType,
    quoteMint,
    quoteDecimals,
    quoteSymbol,
    quoteIcon,
    isLoading: poolLoading,
  } = useTokenContext();

  const { authenticated, walletAddress, login } = usePrivyWallet();

  const { sol: solBalance, baseToken: baseTokenBalance } = useWalletBalances({
    walletAddress,
    baseMint,
    baseDecimals,
    quoteMint,
    quoteDecimals,
  });

  // Fetch DAO data for vault addresses
  const { loading: daoLoading, daoData } = useDaoReadiness(
    daoPda,
    baseMint,
    poolAddress,
    poolType,
    walletAddress
  );

  const isLoading = poolLoading || daoLoading;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex-1 flex flex-col">
        <Header
          walletAddress={walletAddress}
          authenticated={authenticated}
          solBalance={solBalance}
          baseTokenBalance={baseTokenBalance}
          hasWalletBalance={solBalance > 0 || baseTokenBalance > 0}
          login={login}
          isPassMode={true}
          tokenSlug={tokenSlug}
          tokenSymbol={tokenSymbol}
          tokenIcon={icon}
          baseMint={baseMint}
          quoteSymbol={quoteSymbol}
          quoteIcon={quoteIcon}
          isFutarchy={isFutarchy}
        />

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex justify-center overflow-y-auto">
            <div className="w-full max-w-[800px] pt-8 pb-16 md:pb-8 px-4 md:px-0">
              <div className="mb-6">
                <h2 className="text-2xl font-medium" style={{ color: '#E9E9E3' }}>
                  DAO Information
                </h2>
                <p className="text-sm mt-2" style={{ color: '#6B6E71' }}>
                  Vault addresses and management links for {tokenSymbol}
                </p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <p style={{ color: '#6B6E71' }}>Loading DAO information...</p>
                </div>
              ) : !isFutarchy ? (
                <div className="bg-[#121212] border border-[#191919] rounded-[9px] p-6">
                  <p style={{ color: '#6B6E71' }}>
                    This token uses the legacy system and does not have vault information.
                  </p>
                </div>
              ) : !daoData ? (
                <div className="bg-[#121212] border border-[#191919] rounded-[9px] p-6">
                  <p style={{ color: '#6B6E71' }}>
                    Unable to load DAO information.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Treasury Vault */}
                  <div className="bg-[#121212] border border-[#191919] rounded-[9px] p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#DDDDD7' }}>
                        Treasury Vault
                      </h3>
                      <a
                        href={getSquadsUrl(daoData.treasury_vault)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
                        style={{ color: '#BEE8FC' }}
                      >
                        Open in Squads
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <code
                        className="flex-1 px-3 py-2 rounded text-sm font-mono"
                        style={{ backgroundColor: '#1a1a1a', color: '#9B9E9F' }}
                      >
                        {daoData.treasury_vault}
                      </code>
                      <button
                        onClick={() => copyToClipboard(daoData.treasury_vault, 'Treasury vault')}
                        className="p-2 rounded transition-colors hover:bg-white/5 cursor-pointer"
                        title="Copy address"
                      >
                        <Copy className="w-4 h-4" style={{ color: '#6B6E71' }} />
                      </button>
                    </div>
                    <p className="text-xs mt-3" style={{ color: '#6B6E71' }}>
                      Holds treasury funds for the DAO. Managed via Squads multisig.
                    </p>
                  </div>

                  {/* Mint Vault */}
                  <div className="bg-[#121212] border border-[#191919] rounded-[9px] p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#DDDDD7' }}>
                        Mint Vault
                      </h3>
                      <a
                        href={getSquadsUrl(daoData.mint_vault)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
                        style={{ color: '#BEE8FC' }}
                      >
                        Open in Squads
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2">
                      <code
                        className="flex-1 px-3 py-2 rounded text-sm font-mono"
                        style={{ backgroundColor: '#1a1a1a', color: '#9B9E9F' }}
                      >
                        {daoData.mint_vault}
                      </code>
                      <button
                        onClick={() => copyToClipboard(daoData.mint_vault, 'Mint vault')}
                        className="p-2 rounded transition-colors hover:bg-white/5 cursor-pointer"
                        title="Copy address"
                      >
                        <Copy className="w-4 h-4" style={{ color: '#6B6E71' }} />
                      </button>
                    </div>
                    <p className="text-xs mt-3" style={{ color: '#6B6E71' }}>
                      Holds mint authority for the token. Managed via Squads multisig.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
