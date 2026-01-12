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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';
import { CpAmm } from '@meteora-ag/cp-amm-sdk';
import { getConnection } from '@/lib/programs/utils';
import { api, ZcombinatorDAO } from '@/lib/api';

export interface DaoReadinessState {
  loading: boolean;
  daoData: ZcombinatorDAO | null;
  mintAuthorityReady: boolean;
  lpPositionReady: boolean;
  mintVault: string | null;
  adminWallet: string | null;
  ownerWallet: string | null;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to check if a DAO is fully set up for proposal creation.
 * Checks:
 * 1. Mint authority is transferred to mint_vault
 * 2. LP position is owned by admin_wallet (simplified check - just checks for any position)
 *
 * Only performs checks if the connected wallet is the DAO owner.
 */
export function useDaoReadiness(
  daoPda: string | null,
  tokenMint: string | null,
  poolAddress: string | null,
  poolType: 'damm' | 'dlmm' | null,
  walletAddress: string | null
): DaoReadinessState {
  const [loading, setLoading] = useState(true);
  const [daoData, setDaoData] = useState<ZcombinatorDAO | null>(null);
  const [mintAuthorityReady, setMintAuthorityReady] = useState(false);
  const [lpPositionReady, setLpPositionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const connection = useMemo(() => getConnection(), []);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    // Skip if missing required data
    if (!daoPda) {
      setLoading(false);
      return;
    }

    async function checkReadiness() {
      // Guard against null (TypeScript can't infer from outer check)
      if (!daoPda) return;

      setLoading(true);
      setError(null);

      try {
        // 1. Fetch DAO data from API
        const dao = await api.getZcombinatorDaoByPda(daoPda);
        if (!dao) {
          setError('DAO not found');
          setLoading(false);
          return;
        }

        setDaoData(dao);

        // 2. If user is not the owner, skip readiness checks (return as ready)
        if (!walletAddress || dao.owner_wallet !== walletAddress) {
          setMintAuthorityReady(true);
          setLpPositionReady(true);
          setLoading(false);
          return;
        }

        // 3. Check mint authority
        const mintToCheck = tokenMint || dao.token_mint;
        if (mintToCheck && dao.mint_vault) {
          try {
            const mintInfo = await getMint(connection, new PublicKey(mintToCheck));
            const mintAuthReady = mintInfo.mintAuthority?.equals(new PublicKey(dao.mint_vault)) ?? false;
            setMintAuthorityReady(mintAuthReady);
          } catch (err) {
            console.error('Error checking mint authority:', err);
            // If we can't check, assume not ready
            setMintAuthorityReady(false);
          }
        } else {
          setMintAuthorityReady(false);
        }

        // 4. Check LP position ownership
        // For now, we do a simplified check using the zcombinator API
        // A full check would query the pool's position accounts
        const poolToCheck = poolAddress || dao.pool_address;
        if (poolToCheck && dao.admin_wallet) {
          try {
            // Check if admin wallet has any token accounts that might be LP positions
            // This is a simplified heuristic - a proper check would use the Meteora SDK
            const lpReady = await checkLpPosition(
              connection,
              dao.admin_wallet,
              poolToCheck,
              dao.pool_type
            );
            setLpPositionReady(lpReady);
          } catch (err) {
            console.error('Error checking LP position:', err);
            // If we can't check, assume not ready
            setLpPositionReady(false);
          }
        } else {
          setLpPositionReady(false);
        }

      } catch (err) {
        console.error('Error checking DAO readiness:', err);
        setError(err instanceof Error ? err.message : 'Failed to check DAO readiness');
      } finally {
        setLoading(false);
      }
    }

    checkReadiness();
  }, [daoPda, tokenMint, poolAddress, poolType, walletAddress, connection, refreshKey]);

  return {
    loading,
    daoData,
    mintAuthorityReady,
    lpPositionReady,
    mintVault: daoData?.mint_vault || null,
    adminWallet: daoData?.admin_wallet || null,
    ownerWallet: daoData?.owner_wallet || null,
    error,
    refetch,
  };
}

/**
 * Check if the admin wallet has an LP position for the pool.
 * Uses the CpAmm SDK for DAMM pools.
 */
async function checkLpPosition(
  connection: ReturnType<typeof getConnection>,
  adminWallet: string,
  poolAddress: string,
  poolType: 'damm' | 'dlmm'
): Promise<boolean> {
  try {
    const adminPubkey = new PublicKey(adminWallet);
    const poolPubkey = new PublicKey(poolAddress);

    if (poolType === 'damm') {
      // Use CpAmm SDK to check for positions in this specific pool
      const cpAmm = new CpAmm(connection);
      const positions = await cpAmm.getUserPositionByPool(poolPubkey, adminPubkey);
      return positions.length > 0;
    }

    if (poolType === 'dlmm') {
      // DLMM positions require checking the DLMM program's position accounts
      // For now, return true and let proposal creation fail if no position
      // A full implementation would use the DLMM SDK
      return true;
    }

    return false;
  } catch (err) {
    console.error('Error in checkLpPosition:', err);
    return false;
  }
}
