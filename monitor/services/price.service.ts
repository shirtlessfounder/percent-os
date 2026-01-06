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

import { Express } from 'express';
import { Monitor, MonitoredProposal } from '../monitor';
import { SSEManager } from '../lib/sse';

/**
 * SSE Events:
 * - PRICE_UPDATE: { proposalPda, market, price, marketCapUsd, timestamp }
 * - TRADE: { proposalPda, market, userAddress, isBaseToQuote, amountIn, amountOut, price, timestamp }
 */

export class PriceService {
  private sse = new SSEManager();
  private monitor: Monitor | null = null;

  /** Mount SSE endpoint: GET /events */
  mount(app: Express) {
    app.get('/events', (req, res) => {
      const client = this.sse.connect(req, res);
      client.send('connected', { clientId: client.clientId });
    });
  }

  /** Subscribe to monitor events and start price tracking */
  start(monitor: Monitor) {
    this.monitor = monitor;

    // TODO: Subscribe to monitor events
    // monitor.on('proposal:added', (p) => this.startTracking(p));
    // monitor.on('proposal:removed', (p) => this.stopTracking(p));

    // TODO: Setup on-chain price polling

    console.log('[PriceService] Started');
  }

  stop() {
    this.sse.closeAll();
    // TODO: Cleanup price polling intervals
    console.log('[PriceService] Stopped');
  }

  // ─── Price Tracking ──────────────────────────────────────────────

  private startTracking(proposal: MonitoredProposal) {
    // TODO: Start polling prices for this proposal's pools
  }

  private stopTracking(proposal: MonitoredProposal) {
    // TODO: Stop polling, cleanup
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  private onPriceChange(proposalPda: string, market: number, price: number, marketCapUsd: number) {
    this.sse.broadcast('PRICE_UPDATE', {
      proposalPda,
      market,
      price,
      marketCapUsd,
      timestamp: Date.now(),
    });
  }

  private onTrade(trade: {
    proposalPda: string;
    market: number;
    userAddress: string;
    isBaseToQuote: boolean;
    amountIn: string;
    amountOut: string;
    price: string;
  }) {
    this.sse.broadcast('TRADE', {
      ...trade,
      timestamp: Date.now(),
    });
  }
}
