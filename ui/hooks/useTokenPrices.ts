import { useState, useEffect } from 'react';

interface TokenPrices {
  sol: number;
  zc: number;
  loading: boolean;
  error: string | null;
}

const ZC_ADDRESS = 'GVvPZpC6ymCoiHzYJ7CWZ8LhVn9tL2AUpRjSAsLh6jZC';
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

export function useTokenPrices(): TokenPrices {
  const [prices, setPrices] = useState<TokenPrices>({
    sol: 0,
    zc: 0,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        // Fetch both SOL and $ZC prices from DexScreener
        const [solResponse, zcResponse] = await Promise.all([
          fetch(`https://api.dexscreener.com/latest/dex/tokens/${SOL_ADDRESS}`),
          fetch(`https://api.dexscreener.com/latest/dex/tokens/${ZC_ADDRESS}`)
        ]);

        if (!solResponse.ok || !zcResponse.ok) {
          throw new Error('Failed to fetch token prices');
        }

        const solData = await solResponse.json();
        const zcData = await zcResponse.json();

        // Extract SOL price from DexScreener
        const solPairs = solData.pairs || [];
        let solPrice = 0;
        
        if (solPairs.length > 0) {
          // Sort by liquidity and take the highest
          const sortedSolPairs = solPairs.sort((a: any, b: any) => 
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          );
          solPrice = parseFloat(sortedSolPairs[0]?.priceUsd || '0') || 180;
        } else {
          solPrice = 180; // Fallback price
        }

        // Extract $ZC price from DexScreener
        // DexScreener returns pairs, we need to find the most liquid one
        const zcPairs = zcData.pairs || [];
        let zcPrice = 0;
        
        if (zcPairs.length > 0) {
          // Sort by liquidity and take the highest
          const sortedPairs = zcPairs.sort((a: any, b: any) => 
            (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
          );
          zcPrice = parseFloat(sortedPairs[0]?.priceUsd || '0');
        }

        setPrices({
          sol: solPrice,
          zc: zcPrice,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Error fetching token prices:', error);
        // Fallback prices if API fails
        setPrices({
          sol: 180, // Fallback SOL price
          zc: 0.01, // Fallback $ZC price
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch prices'
        });
      }
    };

    fetchPrices();
    // Disabled polling - using WebSocket for real-time prices
    // const interval = setInterval(fetchPrices, 30000);
    // return () => clearInterval(interval);
  }, []);

  return prices;
}