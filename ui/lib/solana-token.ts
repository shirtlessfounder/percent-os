import { Connection, PublicKey } from '@solana/web3.js';
import { getMint } from '@solana/spl-token';

export interface TokenMintInfo {
  supply: number;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

/**
 * Fetches token mint information including total supply from Solana blockchain
 * @param mintAddress - The token mint address
 * @returns Token mint information including supply and decimals
 */
export async function getTokenMintInfo(mintAddress: string): Promise<TokenMintInfo> {
  const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY;
  const rpcUrl = heliusApiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';

  const connection = new Connection(rpcUrl, 'confirmed');
  const mintPublicKey = new PublicKey(mintAddress);

  const mintInfo = await getMint(connection, mintPublicKey);

  return {
    supply: Number(mintInfo.supply),
    decimals: mintInfo.decimals,
    mintAuthority: mintInfo.mintAuthority?.toBase58() || null,
    freezeAuthority: mintInfo.freezeAuthority?.toBase58() || null,
  };
}
