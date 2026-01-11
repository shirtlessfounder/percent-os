import { useState, useEffect } from 'react';
import { isNativeSol, TOKEN_MINTS } from '@/lib/constants/tokens';

interface TokenPrices {
  sol: number; // Quote token price (SOL, USDC, etc.) - named 'sol' for backward compatibility
  baseToken: number; // Base token price (ZC, OOGWAY, etc.)
  loading: boolean;
  error: string | null;
}

interface UseTokenPricesParams {
  baseMint?: string | null;
  quoteMint?: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Known stablecoins - price is always $1
const STABLECOIN_MINTS: Set<string> = new Set([
  TOKEN_MINTS.USDC,
  TOKEN_MINTS.USDT,
]);

export function useTokenPrices(baseMint?: string | null, quoteMint?: string | null): TokenPrices {
  const [prices, setPrices] = useState<TokenPrices>({
    sol: 0,
    baseToken: 0,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Determine if quote is native SOL or a stablecoin - requires quoteMint to be known
        const isQuoteSol = quoteMint ? isNativeSol(quoteMint) : false;
        const isQuoteStablecoin = quoteMint ? STABLECOIN_MINTS.has(quoteMint) : false;

        let quotePrice = 0;

        if (isQuoteSol) {
          // Fetch SOL price from API
          const solResponse = await fetch(`${API_BASE_URL}/api/sol-price`);
          if (!solResponse.ok) {
            throw new Error('Failed to fetch SOL price');
          }
          const solData = await solResponse.json();
          quotePrice = solData.price;
        } else if (isQuoteStablecoin) {
          // Stablecoins are $1
          quotePrice = 1;
        } else if (quoteMint) {
          // Fetch quote token price from DexScreener
          try {
            const tokenResponse = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${quoteMint}`
            );
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              const tokenPairs = tokenData.pairs || [];
              if (tokenPairs.length > 0) {
                const sortedPairs = tokenPairs.sort((a: unknown, b: unknown) => {
                  const aLiq = (a as { liquidity?: { usd?: number } })?.liquidity?.usd || 0;
                  const bLiq = (b as { liquidity?: { usd?: number } })?.liquidity?.usd || 0;
                  return bLiq - aLiq;
                });
                quotePrice = parseFloat(
                  (sortedPairs[0] as { priceUsd?: string })?.priceUsd || '0'
                );
              }
            }
          } catch {
            console.warn(`Could not fetch price for quote token ${quoteMint}`);
          }
        }

        // Fetch base token price from DexScreener (if baseMint provided)
        let baseTokenPrice = 0;

        if (baseMint) {
          try {
            const tokenResponse = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${baseMint}`
            );

            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              const tokenPairs = tokenData.pairs || [];

              if (tokenPairs.length > 0) {
                // Sort by liquidity and take the highest
                const sortedPairs = tokenPairs.sort((a: unknown, b: unknown) => {
                  const aLiq = (a as { liquidity?: { usd?: number } })?.liquidity?.usd || 0;
                  const bLiq = (b as { liquidity?: { usd?: number } })?.liquidity?.usd || 0;
                  return bLiq - aLiq;
                });
                baseTokenPrice = parseFloat(
                  (sortedPairs[0] as { priceUsd?: string })?.priceUsd || '0'
                );
              }
            }
          } catch {
            // Token price fetch failed - use 0
            console.warn(`Could not fetch price for token ${baseMint}`);
          }
        }

        setPrices({
          sol: quotePrice, // Named 'sol' for backward compatibility but holds quote token price
          baseToken: baseTokenPrice,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching token prices:', error);
        setPrices({
          sol: 0,
          baseToken: 0,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch prices'
        });
      }
    };

    fetchPrices();
    // Disabled polling - using WebSocket for real-time prices
    // const interval = setInterval(fetchPrices, 30000);
    // return () => clearInterval(interval);
  }, [baseMint, quoteMint]);

  return prices;
}
