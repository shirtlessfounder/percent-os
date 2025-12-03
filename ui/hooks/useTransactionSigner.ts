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

import { useCallback, useMemo } from 'react';
import { useSignTransaction } from '@privy-io/react-auth/solana';
import { Transaction } from '@solana/web3.js';
import { getConnection } from '@/lib/programs/utils';

/**
 * Hook that wraps Privy's useSignTransaction to provide a simple transaction signing function
 * compatible with our vault SDK's SignTransaction type.
 */
export function useTransactionSigner() {
  const { signTransaction: privySignTransaction } = useSignTransaction();
  const connection = useMemo(() => getConnection(), []);

  const signTransaction = useCallback(
    async (transaction: Transaction): Promise<Transaction> => {
      const signed = await privySignTransaction({
        transaction,
        connection,
      });
      return signed as Transaction;
    },
    [privySignTransaction, connection]
  );

  return { signTransaction };
}
