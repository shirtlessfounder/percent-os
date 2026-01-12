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

import { useCallback } from 'react';
import { useConnectedStandardWallets } from '@privy-io/react-auth/solana';
import { Transaction } from '@solana/web3.js';

/**
 * Hook that provides transaction and message signing using Privy's wallet standard interface.
 * Works with both embedded wallets and external wallets (Phantom via wallet-connect).
 *
 * IMPORTANT: Uses `useConnectedStandardWallets` (not `useSolanaWallets`) because:
 * - `useSolanaWallets` is DEPRECATED and only supports embedded wallets
 * - `useConnectedStandardWallets` supports BOTH embedded AND external wallets
 */
export function useTransactionSigner() {
  const { wallets } = useConnectedStandardWallets();

  const signTransaction = useCallback(
    async (transaction: Transaction): Promise<Transaction> => {
      // Get the first available wallet
      const wallet = wallets[0];

      if (!wallet) {
        throw new Error('No Solana wallet found. Please connect a wallet.');
      }

      // Serialize the transaction to Uint8Array
      const serializedTx = transaction.serialize({ requireAllSignatures: false });

      // Sign the transaction using the standard wallet interface
      const result = await wallet.signTransaction({ transaction: serializedTx });

      // Deserialize the signed transaction back to a Transaction object
      const signedTransaction = Transaction.from(result.signedTransaction);

      return signedTransaction;
    },
    [wallets]
  );

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<Uint8Array> => {
      const wallet = wallets[0];

      if (!wallet) {
        throw new Error('No Solana wallet found. Please connect a wallet.');
      }

      // Sign the message using the standard wallet interface
      const result = await wallet.signMessage({ message });

      return result.signature;
    },
    [wallets]
  );

  const hasWallet = wallets.length > 0;

  return { signTransaction, signMessage, hasWallet };
}
