'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getTokenSymbol, getTokenIcon, isNativeSol, getDisplayDecimals, isStablecoin } from '@/lib/constants/tokens';

interface PoolMetadata {
  poolAddress: string;
  ticker: string;
  baseMint: string;
  quoteMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  moderatorId: number;
  icon?: string;
  // Futarchy-specific fields (new system)
  isFutarchy?: boolean;
  moderatorPda?: string;
  daoPda?: string;
  poolType?: 'damm' | 'dlmm';
  daoType?: 'parent' | 'child';
  parentDaoId?: number | null;
}

interface TokenContextValue {
  tokenSlug: string;
  poolAddress: string | null;
  poolMetadata: PoolMetadata | null;
  // Convenience getters - required, callers must check isLoading before using
  baseMint: string | null;
  baseDecimals: number;
  tokenSymbol: string;
  moderatorId: number | null;
  icon: string | null;
  isLoading: boolean;
  error: string | null;
  // Quote token info - required, callers must check isLoading before using
  quoteMint: string | null;
  quoteDecimals: number;
  quoteSymbol: string;
  quoteIcon: string | null;
  isQuoteSol: boolean;
  isQuoteStablecoin: boolean;
  quoteDisplayDecimals: number;
  // Futarchy-specific fields (new system)
  isFutarchy: boolean;
  moderatorPda: string | null;
  daoPda: string | null;
  poolType: 'damm' | 'dlmm' | null;
  daoType: 'parent' | 'child' | null;
  parentDaoId: number | null;
}

const TokenContext = createContext<TokenContextValue | null>(null);

interface TokenProviderProps {
  tokenSlug: string;
  children: ReactNode;
}

export function TokenProvider({ tokenSlug, children }: TokenProviderProps) {
  const router = useRouter();
  const [poolMetadata, setPoolMetadata] = useState<PoolMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPoolMetadata = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await api.getPoolByName(tokenSlug);

        if (!result) {
          // Pool not found, redirect to default (zc)
          setError('Pool not found');
          router.replace('/zc');
          return;
        }

        setPoolMetadata(result.pool);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pool');
        // Redirect to default on error
        router.replace('/zc');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPoolMetadata();
  }, [tokenSlug, router]);

  const quoteMint = poolMetadata?.quoteMint || null;
  const value: TokenContextValue = {
    tokenSlug,
    poolAddress: poolMetadata?.poolAddress || null,
    poolMetadata,
    baseMint: poolMetadata?.baseMint || null,
    baseDecimals: poolMetadata?.baseDecimals ?? 9,
    tokenSymbol: poolMetadata?.ticker?.toUpperCase() || tokenSlug.toUpperCase(),
    moderatorId: poolMetadata?.moderatorId ?? null,
    icon: poolMetadata?.icon || null,
    isLoading,
    error,
    quoteMint,
    quoteDecimals: poolMetadata?.quoteDecimals ?? 9,
    quoteSymbol: getTokenSymbol(quoteMint),
    quoteIcon: getTokenIcon(quoteMint),
    isQuoteSol: isNativeSol(quoteMint),
    isQuoteStablecoin: isStablecoin(quoteMint),
    quoteDisplayDecimals: getDisplayDecimals(quoteMint),
    // Futarchy-specific fields (new system)
    isFutarchy: poolMetadata?.isFutarchy ?? false,
    moderatorPda: poolMetadata?.moderatorPda || null,
    daoPda: poolMetadata?.daoPda || null,
    poolType: poolMetadata?.poolType || null,
    daoType: poolMetadata?.daoType || null,
    parentDaoId: poolMetadata?.parentDaoId ?? null,
  };

  return (
    <TokenContext.Provider value={value}>
      {children}
    </TokenContext.Provider>
  );
}

export function useTokenContext() {
  const context = useContext(TokenContext);
  if (!context) {
    throw new Error('useTokenContext must be used within TokenProvider');
  }
  return context;
}

// Helper hook for pages that need pool info but should work without context
export function useOptionalTokenContext() {
  return useContext(TokenContext);
}
