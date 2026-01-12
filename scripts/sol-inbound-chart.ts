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
const SURF_TOKEN = 'SurfwRjQQFV6P7JdhxSptf4CjWU8sb88rUiaLCystar';
const DAYS_BACK = 31; // Start from Dec 11 (when Birdeye volume data begins)
const MIN_SOL_AMOUNT = 0.01; // Ignore spam below this

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
  txCount: number;
}

interface DailyVolume {
  date: string;
  volume: number;
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
 * proportionally based on trading volume
 */
const CHUNK_THRESHOLD = 5; // Anything above this SOL is considered a "batch claim" to redistribute

function smoothFeeData(dates: string[], dailyInbound: number[], volumeMap: Map<string, number>): number[] {
  const smoothed = [...dailyInbound];

  // Find all chunk indices (large inflows that are batch claims)
  const chunkIndices: number[] = [];
  for (let i = 0; i < dailyInbound.length; i++) {
    if (dailyInbound[i] >= CHUNK_THRESHOLD) {
      chunkIndices.push(i);
    }
  }

  // For each chunk, distribute it back to the previous chunk (or start of data)
  for (let c = 0; c < chunkIndices.length; c++) {
    const chunkIdx = chunkIndices[c];
    const chunk = dailyInbound[chunkIdx];

    // Range starts at previous chunk + 1, or 0 if this is the first chunk
    const rangeStart = c === 0 ? 0 : chunkIndices[c - 1] + 1;
    const rangeEnd = chunkIdx; // Include the chunk day itself

    console.log(`  Chunk ${c + 1}: ${chunk.toFixed(2)} SOL on ${dates[chunkIdx]}, distributing to ${dates[rangeStart]} - ${dates[rangeEnd]}`);

    // Sum up all small inflows in this range (we'll redistribute the total)
    let totalToDistribute = chunk;
    for (let j = rangeStart; j < rangeEnd; j++) {
      totalToDistribute += dailyInbound[j];
      smoothed[j] = 0; // Clear these, we'll redistribute
    }

    // Calculate total volume over the range
    let totalVolume = 0;
    let volumeDebug: string[] = [];
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const vol = volumeMap.get(dates[j]) || 1;
      totalVolume += vol;
      volumeDebug.push(`${dates[j]}:$${vol.toFixed(0)}`);
    }

    console.log(`  Volume data: ${volumeDebug.slice(0, 5).join(', ')}${volumeDebug.length > 5 ? ` ... (${volumeDebug.length} days)` : ''}`);

    // Distribute proportionally based on volume
    let distributionDebug: string[] = [];
    for (let j = rangeStart; j <= rangeEnd; j++) {
      const dayVolume = volumeMap.get(dates[j]) || 1;
      smoothed[j] = totalToDistribute * (dayVolume / totalVolume);
      distributionDebug.push(`${dates[j].slice(5)}:${smoothed[j].toFixed(2)}`);
    }
    console.log(`  Distribution: ${distributionDebug.slice(0, 8).join(', ')}${distributionDebug.length > 8 ? ` ...` : ''}`);
  }

  return smoothed;
}

async function getSOLInboundForToken(
  connection: Connection,
  tokenAddress: string,
  startTime: number,
  endTime: number
): Promise<{ daily: Map<string, number>; total: number; txCount: number }> {
  const pubkey = new PublicKey(tokenAddress);
  const daily = new Map<string, number>();
  let total = 0;
  let txCount = 0;

  console.log(`  Fetching signatures for ${tokenAddress.slice(0, 8)}...`);

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

      // Look for SOL transfers TO this address
      const solInbound = calculateSOLInbound(tx, tokenAddress);

      if (solInbound >= MIN_SOL_AMOUNT) {
        const date = new Date(sig.blockTime * 1000).toISOString().split('T')[0];
        daily.set(date, (daily.get(date) || 0) + solInbound);
        total += solInbound;
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

  return { daily, total, txCount };
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

async function main() {
  console.log(`\n${COLORS.bright}=== SOL Inbound Chart Generator ===${COLORS.reset}`);
  console.log(`Wallets: ${WALLETS.map(t => t.label).join(', ')}`);
  console.log(`Days: ${DAYS_BACK}`);
  console.log(`Min SOL: ${MIN_SOL_AMOUNT}\n`);

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const endTime = Date.now();
  const startTime = endTime - DAYS_BACK * 24 * 60 * 60 * 1000;

  // Generate all dates in range
  const allDates: string[] = [];
  for (let d = new Date(startTime); d <= new Date(endTime); d.setDate(d.getDate() + 1)) {
    allDates.push(d.toISOString().split('T')[0]);
  }

  // Fetch volume data for smoothing
  console.log(`${COLORS.bright}Fetching SURF volume data...${COLORS.reset}`);
  const volumeMap = await fetchDailyVolume(SURF_TOKEN, DAYS_BACK);
  console.log(`  Got volume data for ${volumeMap.size} days\n`);

  // Fetch SOL price for USD conversion
  console.log(`${COLORS.bright}Fetching SOL price...${COLORS.reset}`);
  const solPrice = await fetchSolPrice();
  console.log(`  SOL price: $${solPrice.toFixed(2)}\n`);

  // Fetch data for each wallet
  const walletData: { label: string; daily: Map<string, number>; total: number; txCount: number }[] = [];

  for (const wallet of WALLETS) {
    console.log(`${COLORS.bright}Processing ${wallet.label}:${COLORS.reset}`);
    try {
      const data = await getSOLInboundForToken(connection, wallet.address, startTime, endTime);
      walletData.push({ label: wallet.label, ...data });
      console.log(`  ${COLORS.green}Total: ${data.total.toFixed(2)} SOL (${data.txCount} txs)${COLORS.reset}\n`);
    } catch (error) {
      console.error(`  ${COLORS.red}Error: ${error}${COLORS.reset}\n`);
      walletData.push({ label: wallet.label, daily: new Map(), total: 0, txCount: 0 });
    }
  }

  // Combine data from all wallets
  const combinedDailyRaw = allDates.map(date =>
    walletData.reduce((sum, wallet) => sum + (wallet.daily.get(date) || 0), 0)
  );

  // Apply smoothing to distribute fee chunks based on volume
  console.log(`${COLORS.bright}Applying volume-based smoothing...${COLORS.reset}`);
  const combinedDaily = smoothFeeData(allDates, combinedDailyRaw, volumeMap);
  console.log(`  Smoothing complete\n`);

  // Calculate cumulative totals
  let cumulative = 0;
  const cumulativeData = combinedDaily.map(daily => {
    cumulative += daily;
    return cumulative;
  });

  const grandTotal = walletData.reduce((sum, t) => sum + t.total, 0);
  const totalTxCount = walletData.reduce((sum, t) => sum + t.txCount, 0);

  console.log(`${COLORS.bright}Combined Total: ${grandTotal.toFixed(2)} SOL (${totalTxCount} txs)${COLORS.reset}`);

  // Debug: show chart data
  console.log(`\n${COLORS.dim}Chart data (first 10 days):${COLORS.reset}`);
  for (let i = 0; i < Math.min(10, allDates.length); i++) {
    console.log(`  ${allDates[i]}: ${combinedDaily[i].toFixed(2)} SOL`);
  }

  // Calculate USD values
  const combinedDailyUsd = combinedDaily.map(v => v * solPrice);
  const cumulativeDataUsd = cumulativeData.map(v => v * solPrice);

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
    .toggle-container { display: flex; gap: 8px; }
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
      <h1>Combinator Fees</h1>
      <div class="toggle-container">
        <button class="toggle-btn active" id="sol-btn" onclick="setMode('sol')">SOL</button>
        <button class="toggle-btn" id="usd-btn" onclick="setMode('usd')">USD</button>
        <button class="toggle-btn" id="profit-btn" onclick="toggleLine('profit')" style="margin-left: 16px; border-color: #f97316;">Profitability</button>
        <button class="toggle-btn" id="private-btn" onclick="toggleLine('private')" style="border-color: #ef4444;">Target</button>
      </div>
    </div>

    <div class="chart-container">
      <canvas id="chart"></canvas>
    </div>
  </div>

  <script>
    const solData = ${JSON.stringify(combinedDaily)};
    const solCumulative = ${JSON.stringify(cumulativeData)};
    const usdData = ${JSON.stringify(combinedDailyUsd)};
    const usdCumulative = ${JSON.stringify(cumulativeDataUsd)};
    const solPrice = ${solPrice};
    let currentMode = 'sol';
    let showProfitLine = false;
    let showPrivateLine = false;

    // Target lines in USD
    const TARGET_HIGH_USD = 14000;
    const TARGET_LOW_USD = 2000;
    // Equivalent in SOL
    const TARGET_HIGH_SOL = TARGET_HIGH_USD / solPrice;
    const TARGET_LOW_SOL = TARGET_LOW_USD / solPrice;

    const ctx = document.getElementById('chart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(allDates)},
        datasets: [
          {
            label: 'Daily Fees',
            data: solData,
            backgroundColor: '#22c55e80',
            borderColor: '#22c55e',
            borderWidth: 1,
          },
          {
            label: 'Cumulative',
            data: solCumulative,
            type: 'line',
            borderColor: '#3b82f6',
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
                const unit = currentMode === 'sol' ? ' SOL' : '';
                const prefix = currentMode === 'usd' ? '$' : '';
                return ctx.dataset.label + ': ' + prefix + ctx.parsed.y.toFixed(2) + unit;
              }
            }
          },
          annotation: {
            annotations: {
              lineHigh: {
                type: 'line',
                yMin: TARGET_HIGH_SOL,
                yMax: TARGET_HIGH_SOL,
                borderColor: '#ef4444',
                borderWidth: 2,
                borderDash: [6, 6],
                display: false,
                label: {
                  display: true,
                  content: '$14k/day ($420k/mo)',
                  position: 'end',
                  backgroundColor: '#ef4444',
                  color: '#fff',
                  font: { size: 11 }
                }
              },
              lineLow: {
                type: 'line',
                yMin: TARGET_LOW_SOL,
                yMax: TARGET_LOW_SOL,
                borderColor: '#f97316',
                borderWidth: 2,
                borderDash: [6, 6],
                display: false,
                label: {
                  display: true,
                  content: '$2k/day ($60k/mo)',
                  position: 'end',
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
            ticks: { color: '#888', maxTicksLimit: 10 }
          },
          y: {
            position: 'left',
            grid: { color: '#333' },
            ticks: {
              color: '#888',
              callback: (v) => currentMode === 'sol' ? v + ' SOL' : '$' + v.toFixed(0)
            },
            title: { display: true, text: currentMode === 'sol' ? 'Daily SOL' : 'Daily USD', color: '#888' }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: {
              color: '#888',
              callback: (v) => currentMode === 'sol' ? v + ' SOL' : '$' + v.toFixed(0)
            },
            title: { display: true, text: currentMode === 'sol' ? 'Cumulative SOL' : 'Cumulative USD', color: '#888' }
          }
        }
      }
    });

    function setMode(mode) {
      currentMode = mode;

      // Update button states
      document.getElementById('sol-btn').classList.toggle('active', mode === 'sol');
      document.getElementById('usd-btn').classList.toggle('active', mode === 'usd');

      // Update chart data
      chart.data.datasets[0].data = mode === 'sol' ? solData : usdData;
      chart.data.datasets[1].data = mode === 'sol' ? solCumulative : usdCumulative;

      // Update axis labels
      chart.options.scales.y.title.text = mode === 'sol' ? 'Daily SOL' : 'Daily USD';
      chart.options.scales.y1.title.text = mode === 'sol' ? 'Cumulative SOL' : 'Cumulative USD';

      // Update target lines for current mode
      const highVal = mode === 'sol' ? TARGET_HIGH_SOL : TARGET_HIGH_USD;
      const lowVal = mode === 'sol' ? TARGET_LOW_SOL : TARGET_LOW_USD;
      const highLabel = mode === 'sol'
        ? TARGET_HIGH_SOL.toFixed(1) + ' SOL/day (' + (TARGET_HIGH_SOL * 30).toFixed(0) + ' SOL/mo)'
        : '$14k/day ($420k/mo)';
      const lowLabel = mode === 'sol'
        ? TARGET_LOW_SOL.toFixed(1) + ' SOL/day (' + (TARGET_LOW_SOL * 30).toFixed(0) + ' SOL/mo)'
        : '$2k/day ($60k/mo)';
      chart.options.plugins.annotation.annotations.lineHigh.yMin = highVal;
      chart.options.plugins.annotation.annotations.lineHigh.yMax = highVal;
      chart.options.plugins.annotation.annotations.lineHigh.label.content = highLabel;
      chart.options.plugins.annotation.annotations.lineLow.yMin = lowVal;
      chart.options.plugins.annotation.annotations.lineLow.yMax = lowVal;
      chart.options.plugins.annotation.annotations.lineLow.label.content = lowLabel;

      chart.update();
    }

    function toggleLine(which) {
      // Update line values and labels for current mode
      const highVal = currentMode === 'sol' ? TARGET_HIGH_SOL : TARGET_HIGH_USD;
      const lowVal = currentMode === 'sol' ? TARGET_LOW_SOL : TARGET_LOW_USD;
      const highLabel = currentMode === 'sol'
        ? TARGET_HIGH_SOL.toFixed(1) + ' SOL/day (' + (TARGET_HIGH_SOL * 30).toFixed(0) + ' SOL/mo)'
        : '$14k/day ($420k/mo)';
      const lowLabel = currentMode === 'sol'
        ? TARGET_LOW_SOL.toFixed(1) + ' SOL/day (' + (TARGET_LOW_SOL * 30).toFixed(0) + ' SOL/mo)'
        : '$2k/day ($60k/mo)';

      if (which === 'profit') {
        showProfitLine = !showProfitLine;
        document.getElementById('profit-btn').classList.toggle('active', showProfitLine);
        chart.options.plugins.annotation.annotations.lineLow.yMin = lowVal;
        chart.options.plugins.annotation.annotations.lineLow.yMax = lowVal;
        chart.options.plugins.annotation.annotations.lineLow.label.content = lowLabel;
        chart.options.plugins.annotation.annotations.lineLow.display = showProfitLine;
      } else if (which === 'private') {
        showPrivateLine = !showPrivateLine;
        document.getElementById('private-btn').classList.toggle('active', showPrivateLine);
        chart.options.plugins.annotation.annotations.lineHigh.yMin = highVal;
        chart.options.plugins.annotation.annotations.lineHigh.yMax = highVal;
        chart.options.plugins.annotation.annotations.lineHigh.label.content = highLabel;
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
