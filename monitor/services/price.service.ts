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

import { Express, Request, Response } from 'express';
import { Monitor, MonitoredProposal } from '../monitor';

/**
 * SSE Events Broadcast:
 *
 * 1. PRICE_UPDATE - Conditional market price changes
 *    { proposalPda, market: 0|1, price, marketCapUsd, timestamp }
 *
 * 2. TRADE - New trade executed
 *    { proposalPda, market, userAddress, isBaseToQuote, amountIn, amountOut, price, txSignature, timestamp }
 *
 * 3. SPOT_PRICE - Spot market price (from DexScreener or AMM)
 *    { proposalPda, price, marketCapUsd, timestamp }
 */

interface SSEClient {
  res: Response;
  proposals: Set<string>; // proposal PDAs subscribed to
}

export class PriceService {
  private clients: Map<string, SSEClient> = new Map(); // clientId -> client
  private monitor: Monitor | null = null;

  /**
   * Mount SSE endpoint on Express app
   * GET /events?proposals=pda1,pda2
   */
  mount(app: Express) {
    app.get('/events', (req, res) => this.handleSSEConnection(req, res));
  }

  /**
   * Subscribe to monitor events and start price polling
   */
  start(monitor: Monitor) {
    this.monitor = monitor;

    // TODO: Subscribe to monitor events
    // monitor.on('proposal:added', (p) => this.startTracking(p));
    // monitor.on('proposal:removed', (p) => this.stopTracking(p));

    // TODO: Setup database listener for trades (pg LISTEN)
    // TODO: Setup price polling intervals
  }

  stop() {
    // TODO: Cleanup intervals, db connection, close all SSE connections
  }

  // ─── SSE Connection Management ───────────────────────────────────

  private handleSSEConnection(req: Request, res: Response) {
    // TODO: Set SSE headers
    // TODO: Parse ?proposals= query param
    // TODO: Add to this.clients
    // TODO: Setup keepalive interval
    // TODO: Handle req.on('close') cleanup
  }

  private broadcast(event: string, data: any, proposalPda: string) {
    // TODO: Send to all clients subscribed to this proposal
    // res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // ─── Price Tracking ──────────────────────────────────────────────

  private startTracking(proposal: MonitoredProposal) {
    // TODO: Start polling prices for this proposal's pools
  }

  private stopTracking(proposal: MonitoredProposal) {
    // TODO: Stop polling, cleanup
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  private onPriceChange(proposalPda: string, market: number, price: number) {
    // TODO: broadcast('PRICE_UPDATE', {...}, proposalPda)
  }

  private onTrade(trade: any) {
    // TODO: broadcast('TRADE', {...}, trade.proposalPda)
  }

  private onSpotPriceChange(proposalPda: string, price: number) {
    // TODO: broadcast('SPOT_PRICE', {...}, proposalPda)
  }
}
