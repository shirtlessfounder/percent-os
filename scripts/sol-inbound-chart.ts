#!/usr/bin/env tsx
/**
 * SOL Inbound Chart Generator
 *
 * Generates an interactive HTML chart showing daily SOL inbound for specified tokens
 * with a cumulative line overlay.
 *
 * Usage: pnpm tsx scripts/sol-inbound-chart.ts
 * Output: /tmp/sol-inbound-chart.html
 */

import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuration
const WALLETS = [
  { address: 'FEEnkcCNE2623LYCPtLf63LFzXpCFigBLTu4qZovRGZC', label: 'FEE' },
  { address: '7rajfxUQBHRXiSrQWQo9FZ2zBbLy4Xvh9yYfa7tkvj4U', label: '7raj' },
];
// Volume tokens for smoothing
const SURF_TOKEN = 'SurfwRjQQFV6P7JdhxSptf4CjWU8sb88rUiaLCystar'; // For SOL fee smoothing
const STAR_TOKEN = 'StargWr5r6r8gZSjmEKGZ1dmvKWkj79r2z1xqjFstar'; // For USDC fee smoothing
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const START_DATE = new Date('2025-12-01T00:00:00Z');
const MIN_SOL_AMOUNT = 0.01; // Ignore spam below this
const MIN_USDC_AMOUNT = 0.01; // Ignore spam below this

// ANSI colors for console
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

interface DailyData {
  date: string;
  solInbound: number;
  usdcInbound: number;
  txCount: number;
}

interface DailyVolume {
  date: string;
  volume: number;
}

interface InboundResult {
  dailySol: Map<string, number>;
  dailyUsdc: Map<string, number>;
  totalSol: number;
  totalUsdc: number;
  txCount: number;
}

/**
 * Fetch current SOL price in USD
 */
async function fetchSolPrice(): Promise<number> {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana?.usd || 200; // Default to $200 if fetch fails
  } catch (error) {
    console.log(`  SOL price fetch error: ${error}, using default $200`);
    return 200;
  }
}

/**
 * Fetch daily volume for a token using Birdeye API
 */
async function fetchDailyVolume(tokenAddress: string, days: number): Promise<Map<string, number>> {
  const volumeMap = new Map<string, number>();

  try {
    // Use Birdeye OHLCV endpoint for daily candles
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - (days * 24 * 60 * 60);

    const url = `https://public-api.birdeye.so/defi/ohlcv?address=${tokenAddress}&type=1D&time_from=${startTime}&time_to=${endTime}`;

    const response = await fetch(url, {
      headers: {
        'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
      }
    });

    if (!response.ok) {
      console.log(`  Birdeye API error: ${response.status}, trying DexScreener...`);
      return await fetchDailyVolumeFromDexScreener(tokenAddress, days);
    }

    const data = await response.json();

    if (data.data?.items) {
      for (const item of data.data.items) {
        const date = new Date(item.unixTime * 1000).toISOString().split('T')[0];
        volumeMap.set(date, item.v || 0); // v is volume
      }
      // Log the date range we got
      const dates = Array.from(volumeMap.keys()).sort();
      if (dates.length > 0) {
        console.log(`  Birdeye data range: ${dates[0]} to ${dates[dates.length - 1]}`);
      }
    }
  } catch (error) {
    console.log(`  Volume fetch error: ${error}, trying DexScreener...`);
    return await fetchDailyVolumeFromDexScreener(tokenAddress, days);
  }

  return volumeMap;
}

/**
 * Fallback: fetch volume from DexScreener
 */
async function fetchDailyVolumeFromDexScreener(tokenAddress: string, days: number): Promise<Map<string, number>> {
  const volumeMap = new Map<string, number>();

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`  DexScreener API error: ${response.status}`);
      return volumeMap;
    }

    const data = await response.json();

    // DexScreener only gives current volume, not historical
    // We'll use 24h volume as a proxy and distribute evenly for now
    if (data.pairs && data.pairs.length > 0) {
      const totalVolume24h = data.pairs.reduce((sum: number, pair: any) => sum + (pair.volume?.h24 || 0), 0);
      console.log(`  DexScreener 24h volume: $${totalVolume24h.toFixed(0)}`);

      // For simplicity, assume constant volume per day
      const today = new Date().toISOString().split('T')[0];
      for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        volumeMap.set(date, totalVolume24h); // Use same volume as approximation
      }
    }
  } catch (error) {
    console.log(`  DexScreener error: ${error}`);
  }

  return volumeMap;
}

/**
 * Smooth fee data by distributing large chunks backwards to the previous chunk
 * proportionally based on trading volume.
 *
 * Only distributes to days that have actual volume data - days without volume
 * data are left at 0 to avoid misleading equal distribution.
 */
const CHUNK_THRESHOLD = 5; // Anything above this is considered a "batch claim" to redistribute

function smoothFeeData(dates: string[], dailyInbound: number[], volumeMap: Map<string, number>): number[] {
  const smoothed = [...dailyInbound];

  // Find all chunk indices (large inflows that are batch claims)
  const chunkIndices: number[] = [];
  for (let i = 0; i < dailyInbound.length; i++) {
    if (dailyInbound[i] >= CHUNK_THRESHOLD) {
      chunkIndices.push(i);
    }
  }

  if (chunkIndices.length === 0) {
    console.log(`  No chunks found (threshold: ${CHUNK_THRESHOLD}), returning raw data`);
    return smoothed;
  }

  // For each chunk, distribute it back to the previous chunk (or start of data)
  for (let c = 0; c < chunkIndices.length; c++) {
    const chunkIdx = chunkIndices[c];
    const chunk = dailyInbound[chunkIdx];

    // Range starts at previous chunk + 1, or 0 if this is the first chunk
    const rangeStart = c === 0 ? 0 : chunkIndices[c - 1] + 1;
    const rangeEnd = chunkIdx; // Include the chunk day itself

    console.log(`  Chunk ${c + 1}: ${chunk.toFixed(2)} on ${dates[chunkIdx]}, distributing to ${dates[rangeStart]} - ${dates[rangeEnd]}`);

    // Sum up all small inflows in this range (we'll redistribute the total)
    let totalToDistribute = chunk;
    for (let j = rangeStart; j < rangeEnd; j++) {
      totalToDistribute += dailyInbound[j];
      smoothed[j] = 0; // Clear these, we'll redistribute
    }

    // Find days with actual volume data in this range
    const daysWithVolume: { idx: number; vol: number }[] = [];
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const vol = volumeMap.get(dates[j]);
      if (vol !== undefined && vol > 0) {
        daysWithVolume.push({ idx: j, vol });
      }
    }

    const totalDaysInRange = rangeEnd - rangeStart + 1;
    const coveragePercent = ((daysWithVolume.length / totalDaysInRange) * 100).toFixed(0);
    console.log(`  Volume coverage: ${daysWithVolume.length}/${totalDaysInRange} days (${coveragePercent}%)`);

    if (daysWithVolume.length === 0) {
      // No volume data at all - just put everything on the chunk day
      console.log(`  WARNING: No volume data in range, keeping on chunk day`);
      smoothed[chunkIdx] = totalToDistribute;
      continue;
    }

    // Calculate total volume over days that have data
    const totalVolume = daysWithVolume.reduce((sum, d) => sum + d.vol, 0);

    // Show volume data sample
    const volumeDebug = daysWithVolume.slice(0, 5).map(d => `${dates[d.idx]}:$${(d.vol / 1e6).toFixed(1)}M`);
    console.log(`  Volume data: ${volumeDebug.join(', ')}${daysWithVolume.length > 5 ? ` ... (${daysWithVolume.length} days)` : ''}`);

    // Distribute proportionally based on volume (only to days with volume data)
    smoothed[chunkIdx] = 0; // Clear chunk day, will be set below if it has volume
    for (const { idx, vol } of daysWithVolume) {
      smoothed[idx] = totalToDistribute * (vol / totalVolume);
    }

    // Show distribution sample (first 5 and last 5)
    const first5 = daysWithVolume.slice(0, 5).map(d => `${dates[d.idx].slice(5)}:${smoothed[d.idx].toFixed(2)}`);
    const last5 = daysWithVolume.slice(-5).map(d => `${dates[d.idx].slice(5)}:${smoothed[d.idx].toFixed(2)}`);
    console.log(`  Distribution (first 5): ${first5.join(', ')}`);
    console.log(`  Distribution (last 5): ${last5.join(', ')}`);
  }

  return smoothed;
}

async function getInboundForWallet(
  connection: Connection,
  walletAddress: string,
  startTime: number,
  endTime: number
): Promise<InboundResult> {
  const pubkey = new PublicKey(walletAddress);
  const dailySol = new Map<string, number>();
  const dailyUsdc = new Map<string, number>();
  let totalSol = 0;
  let totalUsdc = 0;
  let txCount = 0;

  console.log(`  Fetching signatures for ${walletAddress.slice(0, 8)}...`);

  // Fetch all signatures in the time range
  let signatures: { signature: string; blockTime: number | null }[] = [];
  let before: string | undefined = undefined;
  let keepFetching = true;

  while (keepFetching) {
    const sigs = await connection.getSignaturesForAddress(pubkey, {
      before,
      limit: 1000,
    });

    if (sigs.length === 0) break;

    for (const sig of sigs) {
      if (sig.blockTime) {
        const sigTime = sig.blockTime * 1000;
        if (sigTime < startTime) {
          keepFetching = false;
          break;
        }
        if (sigTime <= endTime) {
          signatures.push({ signature: sig.signature, blockTime: sig.blockTime });
        }
      }
    }

    before = sigs[sigs.length - 1].signature;

    // Rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`  Found ${signatures.length} signatures in time range`);

  // Process transactions in batches
  const batchSize = 20;
  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    const txs = await connection.getParsedTransactions(
      batch.map(s => s.signature),
      { maxSupportedTransactionVersion: 0 }
    );

    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      const sig = batch[j];
      if (!tx || !sig.blockTime) continue;

      const date = new Date(sig.blockTime * 1000).toISOString().split('T')[0];

      // Look for SOL transfers TO this address
      const solInbound = calculateSOLInbound(tx, walletAddress);
      if (solInbound >= MIN_SOL_AMOUNT) {
        dailySol.set(date, (dailySol.get(date) || 0) + solInbound);
        totalSol += solInbound;
        txCount++;
      }

      // Look for USDC transfers TO this address
      const usdcInbound = calculateUSDCInbound(tx, walletAddress);
      if (usdcInbound >= MIN_USDC_AMOUNT) {
        dailyUsdc.set(date, (dailyUsdc.get(date) || 0) + usdcInbound);
        totalUsdc += usdcInbound;
        txCount++;
      }
    }

    // Progress update
    if (i % 100 === 0 && i > 0) {
      console.log(`  Processed ${i}/${signatures.length} transactions...`);
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 50));
  }

  return { dailySol, dailyUsdc, totalSol, totalUsdc, txCount };
}

function calculateSOLInbound(tx: ParsedTransactionWithMeta, targetAddress: string): number {
  if (!tx.meta) return 0;

  const accountKeys = tx.transaction.message.accountKeys;
  let targetIndex = -1;

  for (let i = 0; i < accountKeys.length; i++) {
    if (accountKeys[i].pubkey.toBase58() === targetAddress) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) return 0;

  const preBalance = tx.meta.preBalances[targetIndex] || 0;
  const postBalance = tx.meta.postBalances[targetIndex] || 0;
  const diff = postBalance - preBalance;

  // Only count inbound (positive diff), convert from lamports to SOL
  return diff > 0 ? diff / 1e9 : 0;
}

function calculateUSDCInbound(tx: ParsedTransactionWithMeta, targetAddress: string): number {
  if (!tx.meta) return 0;

  // Look through token balance changes for USDC transfers to target
  const preTokenBalances = tx.meta.preTokenBalances || [];
  const postTokenBalances = tx.meta.postTokenBalances || [];

  // Find USDC token accounts owned by target address
  let totalUsdcInbound = 0;

  for (const postBalance of postTokenBalances) {
    // Check if this is USDC and owned by target
    if (postBalance.mint !== USDC_MINT) continue;
    if (postBalance.owner !== targetAddress) continue;

    // Find matching pre-balance
    const preBalance = preTokenBalances.find(
      pre => pre.accountIndex === postBalance.accountIndex
    );

    const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
    const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
    const diff = postAmount - preAmount;

    if (diff > 0) {
      totalUsdcInbound += diff;
    }
  }

  return totalUsdcInbound;
}

async function main() {
  console.log(`\n${COLORS.bright}=== SOL & USDC Inbound Chart Generator ===${COLORS.reset}`);
  console.log(`Wallets: ${WALLETS.map(t => t.label).join(', ')}`);
  console.log(`Start date: ${START_DATE.toISOString().split('T')[0]}`);
  console.log(`Min SOL: ${MIN_SOL_AMOUNT}, Min USDC: ${MIN_USDC_AMOUNT}\n`);

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const startTime = START_DATE.getTime();
  const endTime = Date.now();
  const daysBack = Math.ceil((endTime - startTime) / (24 * 60 * 60 * 1000));

  // Generate all dates in range
  const allDates: string[] = [];
  for (let d = new Date(startTime); d <= new Date(endTime); d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().split('T')[0]);
  }

  // Fetch volume data for smoothing (SURF for SOL fees, STAR for USDC fees)
  console.log(`${COLORS.bright}Fetching SURF volume data (for SOL smoothing)...${COLORS.reset}`);
  const surfVolumeMap = await fetchDailyVolume(SURF_TOKEN, daysBack);
  console.log(`  Got volume data for ${surfVolumeMap.size} days\n`);

  console.log(`${COLORS.bright}Fetching STAR volume data (for USDC smoothing)...${COLORS.reset}`);
  const starVolumeMap = await fetchDailyVolume(STAR_TOKEN, daysBack);
  console.log(`  Got volume data for ${starVolumeMap.size} days\n`);

  // Fetch SOL price for USD conversion
  console.log(`${COLORS.bright}Fetching SOL price...${COLORS.reset}`);
  const solPrice = await fetchSolPrice();
  console.log(`  SOL price: $${solPrice.toFixed(2)}\n`);

  // Fetch data for each wallet
  const walletData: { label: string; dailySol: Map<string, number>; dailyUsdc: Map<string, number>; totalSol: number; totalUsdc: number; txCount: number }[] = [];

  for (const wallet of WALLETS) {
    console.log(`${COLORS.bright}Processing ${wallet.label}:${COLORS.reset}`);
    try {
      const data = await getInboundForWallet(connection, wallet.address, startTime, endTime);
      walletData.push({ label: wallet.label, ...data });
      console.log(`  ${COLORS.green}Total: ${data.totalSol.toFixed(2)} SOL, ${data.totalUsdc.toFixed(2)} USDC (${data.txCount} txs)${COLORS.reset}\n`);
    } catch (error) {
      console.error(`  ${COLORS.red}Error: ${error}${COLORS.reset}\n`);
      walletData.push({ label: wallet.label, dailySol: new Map(), dailyUsdc: new Map(), totalSol: 0, totalUsdc: 0, txCount: 0 });
    }
  }

  // Combine SOL data from all wallets
  const combinedSolRaw = allDates.map(date =>
    walletData.reduce((sum, wallet) => sum + (wallet.dailySol.get(date) || 0), 0)
  );

  // Combine USDC data from all wallets
  const combinedUsdcRaw = allDates.map(date =>
    walletData.reduce((sum, wallet) => sum + (wallet.dailyUsdc.get(date) || 0), 0)
  );

  // Apply smoothing to distribute fee chunks based on volume
  console.log(`${COLORS.bright}Applying volume-based smoothing for SOL...${COLORS.reset}`);
  const combinedSol = smoothFeeData(allDates, combinedSolRaw, surfVolumeMap);
  console.log(`  SOL smoothing complete\n`);

  console.log(`${COLORS.bright}Applying volume-based smoothing for USDC...${COLORS.reset}`);
  const combinedUsdc = smoothFeeData(allDates, combinedUsdcRaw, starVolumeMap);
  console.log(`  USDC smoothing complete\n`);


  const grandTotalSol = walletData.reduce((sum, t) => sum + t.totalSol, 0);
  const grandTotalUsdc = walletData.reduce((sum, t) => sum + t.totalUsdc, 0);
  const totalTxCount = walletData.reduce((sum, t) => sum + t.txCount, 0);

  console.log(`${COLORS.bright}Combined Total: ${grandTotalSol.toFixed(2)} SOL, ${grandTotalUsdc.toFixed(2)} USDC (${totalTxCount} txs)${COLORS.reset}`);

  // Combined daily in USD (SOL converted + USDC)
  const combinedDailyUsd = combinedSol.map((sol, i) => sol * solPrice + combinedUsdc[i]);
  const cumulativeUsd = combinedDailyUsd.reduce((acc: number[], daily, i) => {
    acc.push((acc[i - 1] || 0) + daily);
    return acc;
  }, []);

  // SOL in USD for stacking
  const solInUsd = combinedSol.map(v => v * solPrice);

  // Generate HTML
  const htmlPath = '/tmp/sol-inbound-chart.html';
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Combinator Fees</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      margin: 0;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    h1 { font-size: 24px; margin: 0; }
    .stats { font-size: 14px; color: #888; margin-top: 4px; }
    .toggle-container { display: flex; gap: 8px; flex-wrap: wrap; }
    .toggle-btn {
      padding: 8px 16px;
      border: 1px solid #333;
      background: transparent;
      color: #888;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .toggle-btn.active {
      background: #22c55e;
      border-color: #22c55e;
      color: #000;
    }
    #profit-btn.active {
      background: #f97316;
      border-color: #f97316;
    }
    #private-btn.active {
      background: #ef4444;
      border-color: #ef4444;
    }
    .chart-container { background: #111; border-radius: 12px; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1>Combinator Fees</h1>
        <div class="stats">Total: ${grandTotalSol.toFixed(2)} SOL + ${grandTotalUsdc.toFixed(2)} USDC = $${(grandTotalSol * solPrice + grandTotalUsdc).toFixed(0)} USD</div>
      </div>
      <div class="toggle-container">
        <button class="toggle-btn" id="profit-btn" onclick="toggleLine('profit')" style="border-color: #f97316;">Profitability</button>
        <button class="toggle-btn" id="private-btn" onclick="toggleLine('private')" style="border-color: #ef4444;">Target</button>
      </div>
    </div>

    <div class="chart-container">
      <canvas id="chart"></canvas>
    </div>
  </div>

  <script>
    // SOL data in USD for stacking
    const solInUsd = ${JSON.stringify(solInUsd)};
    // USDC data (already in USD)
    const usdcData = ${JSON.stringify(combinedUsdc)};
    // Combined cumulative
    const combinedUsdCumulative = ${JSON.stringify(cumulativeUsd)};

    const solPrice = ${solPrice};
    let showProfitLine = false;
    let showPrivateLine = false;

    // Target lines in USD
    const TARGET_HIGH_USD = 14000;
    const TARGET_LOW_USD = 2000;

    const ctx = document.getElementById('chart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(allDates)},
        datasets: [
          {
            label: 'SOL Fees (USD)',
            data: solInUsd,
            backgroundColor: '#22c55e',
            borderColor: '#22c55e',
            borderWidth: 0,
            stack: 'fees',
          },
          {
            label: 'USDC Fees',
            data: usdcData,
            backgroundColor: '#3b82f6',
            borderColor: '#3b82f6',
            borderWidth: 0,
            stack: 'fees',
          },
          {
            label: 'Cumulative USD',
            data: combinedUsdCumulative,
            type: 'line',
            borderColor: '#8b5cf6',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            yAxisID: 'y1',
            tension: 0.1,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { position: 'top', labels: { color: '#fff', boxWidth: 12, boxHeight: 12 } },
          tooltip: {
            backgroundColor: '#222',
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: (ctx) => {
                return ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(2);
              },
              footer: (items) => {
                const total = items.reduce((sum, item) => {
                  if (item.dataset.stack === 'fees') {
                    return sum + item.parsed.y;
                  }
                  return sum;
                }, 0);
                return 'Total: $' + total.toFixed(2);
              }
            }
          },
          annotation: {
            annotations: {
              lineHigh: {
                type: 'line',
                yMin: TARGET_HIGH_USD,
                yMax: TARGET_HIGH_USD,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [6, 6],
                display: false,
                label: {
                  display: true,
                  content: '$14k/day ($420k/mo)',
                  position: 'start',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  font: { size: 11 }
                }
              },
              lineLow: {
                type: 'line',
                yMin: TARGET_LOW_USD,
                yMax: TARGET_LOW_USD,
                borderColor: '#f97316',
                borderWidth: 2,
                borderDash: [6, 6],
                display: false,
                label: {
                  display: true,
                  content: '$2k/day ($60k/mo)',
                  position: 'start',
                  backgroundColor: '#f97316',
                  color: '#fff',
                  font: { size: 11 }
                }
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'day', displayFormats: { day: 'MMM d' } },
            grid: { color: '#333' },
            ticks: { color: '#888', maxTicksLimit: 10 },
            stacked: true,
          },
          y: {
            position: 'left',
            grid: { color: '#333' },
            stacked: true,
            ticks: {
              color: '#888',
              callback: (v) => '$' + v.toFixed(0)
            },
            title: { display: true, text: 'Daily USD', color: '#888' }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              color: '#888',
              callback: (v) => '$' + v.toFixed(0)
            },
            title: { display: true, text: 'Cumulative USD', color: '#888' }
          }
        }
      }
    });

    function toggleLine(which) {
      if (which === 'profit') {
        showProfitLine = !showProfitLine;
        document.getElementById('profit-btn').classList.toggle('active', showProfitLine);
        chart.options.plugins.annotation.annotations.lineLow.display = showProfitLine;
      } else if (which === 'private') {
        showPrivateLine = !showPrivateLine;
        document.getElementById('private-btn').classList.toggle('active', showPrivateLine);
        chart.options.plugins.annotation.annotations.lineHigh.display = showPrivateLine;
      }
      chart.update();
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);
  console.log(`\n${COLORS.bright}Chart saved to:${COLORS.reset} ${htmlPath}`);
  console.log(`Open with: ${COLORS.cyan}open ${htmlPath}${COLORS.reset}`);
}

main().catch(console.error);
