/*
 * Copyright (C) 2026 Spice Finance Inc.
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

export interface PriceUpdate {
  tokenAddress: string;
  price: number;
  priceUsd?: number;
  timestamp: number;
}

export interface TradeUpdate {
  proposalId: number;
  market: number;  // Numeric market index (0-3 for quantum markets)
  userAddress: string;
  amountIn: number;
  amountOut: number;
  price: number; // OLD: price in SOL (legacy backend)
  marketCapUsd?: number; // NEW: pre-calculated market cap USD (updated backend)
  timestamp: number;
}

export interface ChartPriceUpdate {
  proposalId: number;
  market: number | 'spot';  // -1 (WebSocket) or 'spot' (REST API) for spot market, 0+ for conditional markets
  price: number; // OLD: price in SOL (legacy backend)
  marketCapUsd?: number; // NEW: pre-calculated market cap USD (updated backend)
  timestamp: number;
}

type PriceUpdateCallback = (update: PriceUpdate) => void;
type TradeUpdateCallback = (update: TradeUpdate) => void;
type ChartPriceUpdateCallback = (update: ChartPriceUpdate) => void;

export class PriceStreamService {
  private ws: WebSocket | null = null;
  private subscriptions: Map<string, PriceUpdateCallback[]> = new Map();
  private tradeSubscriptions: Map<string, TradeUpdateCallback[]> = new Map(); // "moderatorId-proposalId" -> callbacks
  private chartPriceSubscriptions: Map<string, ChartPriceUpdateCallback[]> = new Map(); // "moderatorId-proposalId" -> callbacks
  private poolAddresses: Map<string, string> = new Map(); // Store pool addresses for reconnection
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor(private wsUrl: string = 'ws://localhost:9091') {}

  public connect(): Promise<void> {
    if (this.isConnecting) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      // Skip WebSocket on server-side rendering
      if (typeof window === 'undefined') {
        resolve();
        return;
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.setupPingInterval();

          // Resubscribe to all tokens with their pool addresses if available
          if (this.subscriptions.size > 0) {
            const subscriptionData: Array<string | { address: string; poolAddress?: string }> = [];
            for (const [token, _] of this.subscriptions) {
              const poolAddress = this.poolAddresses.get(token);
              if (poolAddress) {
                subscriptionData.push({ address: token, poolAddress });
              } else {
                subscriptionData.push(token);
              }
            }
            this.sendSubscription(subscriptionData);
          }

          // Resubscribe to all trades
          if (this.tradeSubscriptions.size > 0) {
            for (const subscriptionKey of this.tradeSubscriptions.keys()) {
              const [moderatorId, proposalId] = subscriptionKey.split('-').map(Number);
              this.sendTradeSubscription(moderatorId, proposalId);
            }
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        this.ws.onerror = () => {
          this.isConnecting = false;
          console.warn('WebSocket error, will attempt reconnection');
          resolve(); // Resolve anyway to not block
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.cleanup();
          this.scheduleReconnect();
        };
      } catch (error) {
        this.isConnecting = false;
        console.error('Error creating WebSocket:', error);
        resolve(); // Resolve anyway to not block
      }
    });
  }

  private handleMessage(message: any) {
    if (message.type === 'PRICE_UPDATE' && message.data) {
      const { tokenAddress, price, priceUsd, timestamp } = message.data;

      // Notify all callbacks for this token
      const callbacks = this.subscriptions.get(tokenAddress) || [];
      callbacks.forEach(callback => {
        try {
          callback({ tokenAddress, price, priceUsd, timestamp });
        } catch (error) {
          console.error('Error in price callback:', error);
        }
      });
    } else if (message.type === 'PRICE_UPDATE' && message.proposalId !== undefined) {
      // Chart price update from price_history table
      const { moderatorId, proposalId, market, price, marketCapUsd, timestamp } = message;

      // Convert timestamp to milliseconds if it's a string
      const timestampMs = typeof timestamp === 'string'
        ? new Date(timestamp).getTime()
        : timestamp;

      const subscriptionKey = `${moderatorId}-${proposalId}`;
      const callbacks = this.chartPriceSubscriptions.get(subscriptionKey) || [];

      // Notify all callbacks for this proposal
      callbacks.forEach((callback) => {
        try {
          callback({ proposalId, market, price, marketCapUsd, timestamp: timestampMs });
        } catch (error) {
          console.error('Error in chart price callback:', error);
        }
      });
    } else if (message.type === 'TRADE') {
      // Handle trade notification
      const { moderatorId, proposalId, market, userAddress, amountIn, amountOut, price, marketCapUsd, timestamp } = message;

      // Convert timestamp to milliseconds if it's a string
      const timestampMs = typeof timestamp === 'string'
        ? new Date(timestamp).getTime()
        : timestamp;

      const subscriptionKey = `${moderatorId}-${proposalId}`;

      // Notify all callbacks for this proposal
      const callbacks = this.tradeSubscriptions.get(subscriptionKey) || [];
      callbacks.forEach(callback => {
        try {
          callback({ proposalId, market, userAddress, amountIn, amountOut, price, marketCapUsd, timestamp: timestampMs });
        } catch (error) {
          console.error('Error in trade callback:', error);
        }
      });
    } else if (message.type === 'PONG') {
      // Pong received, connection is alive
    }
  }

  private setupPingInterval() {
    if (typeof window === 'undefined') return;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private sendSubscription(tokens: Array<string | { address: string; poolAddress?: string }>) {
    if (typeof window === 'undefined') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        tokens
      }));
    }
  }

  private sendUnsubscription(tokens: string[]) {
    if (typeof window === 'undefined') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'UNSUBSCRIBE',
        tokens
      }));
    }
  }

  public async subscribeToToken(tokenAddress: string, callback: PriceUpdateCallback, poolAddress?: string): Promise<void> {
    // Ensure we're connected
    await this.connect();

    // Add callback to subscription list
    const callbacks = this.subscriptions.get(tokenAddress) || [];
    callbacks.push(callback);
    this.subscriptions.set(tokenAddress, callbacks);

    // Store pool address for reconnection
    if (poolAddress) {
      this.poolAddresses.set(tokenAddress, poolAddress);
    }

    // Send subscription message with pool address if provided
    const subscriptionData = poolAddress
      ? [{ address: tokenAddress, poolAddress }]
      : [tokenAddress];
    this.sendSubscription(subscriptionData);
  }

  public unsubscribeFromToken(tokenAddress: string, callback: PriceUpdateCallback): void {
    const callbacks = this.subscriptions.get(tokenAddress) || [];
    const index = callbacks.indexOf(callback);
    
    if (index > -1) {
      callbacks.splice(index, 1);
      
      if (callbacks.length === 0) {
        this.subscriptions.delete(tokenAddress);
        this.poolAddresses.delete(tokenAddress); // Clean up pool address
        this.sendUnsubscription([tokenAddress]);
      } else {
        this.subscriptions.set(tokenAddress, callbacks);
      }
    }
  }

  public async subscribeToTrades(moderatorId: number, proposalId: number, callback: TradeUpdateCallback): Promise<void> {
    // Ensure we're connected
    await this.connect();

    const subscriptionKey = `${moderatorId}-${proposalId}`;
    // Add callback to subscription list
    const callbacks = this.tradeSubscriptions.get(subscriptionKey) || [];
    const isFirstSubscription = callbacks.length === 0;
    callbacks.push(callback);
    this.tradeSubscriptions.set(subscriptionKey, callbacks);

    // Send subscription message to server (only on first subscription for this proposal)
    if (isFirstSubscription) {
      this.sendTradeSubscription(moderatorId, proposalId);
    }
  }

  private sendTradeSubscription(moderatorId: number, proposalId: number) {
    if (typeof window === 'undefined') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE_TRADES',
        moderatorId,
        proposalId
      }));
    }
  }

  private sendTradeUnsubscription(moderatorId: number, proposalId: number) {
    if (typeof window === 'undefined') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'UNSUBSCRIBE_TRADES',
        moderatorId,
        proposalId
      }));
    }
  }

  public unsubscribeFromTrades(moderatorId: number, proposalId: number, callback: TradeUpdateCallback): void {
    const subscriptionKey = `${moderatorId}-${proposalId}`;
    const callbacks = this.tradeSubscriptions.get(subscriptionKey) || [];
    const index = callbacks.indexOf(callback);

    if (index > -1) {
      callbacks.splice(index, 1);

      if (callbacks.length === 0) {
        this.tradeSubscriptions.delete(subscriptionKey);
        this.sendTradeUnsubscription(moderatorId, proposalId);
      } else {
        this.tradeSubscriptions.set(subscriptionKey, callbacks);
      }
    }
  }

  public async subscribeToChartPrices(moderatorId: number, proposalId: number, callback: ChartPriceUpdateCallback): Promise<void> {
    // Ensure we're connected
    await this.connect();

    const subscriptionKey = `${moderatorId}-${proposalId}`;
    // Add callback to subscription list
    const callbacks = this.chartPriceSubscriptions.get(subscriptionKey) || [];
    callbacks.push(callback);
    this.chartPriceSubscriptions.set(subscriptionKey, callbacks);

    // Reuse trade subscription to subscribe to proposal (includes both trades and prices)
    const isFirstSubscription = !this.tradeSubscriptions.has(subscriptionKey) && callbacks.length === 1;
    if (isFirstSubscription) {
      this.sendTradeSubscription(moderatorId, proposalId);
    }
  }

  public unsubscribeFromChartPrices(moderatorId: number, proposalId: number, callback: ChartPriceUpdateCallback): void {
    const subscriptionKey = `${moderatorId}-${proposalId}`;
    const callbacks = this.chartPriceSubscriptions.get(subscriptionKey) || [];
    const index = callbacks.indexOf(callback);

    if (index > -1) {
      callbacks.splice(index, 1);

      if (callbacks.length === 0) {
        this.chartPriceSubscriptions.delete(subscriptionKey);
        // Only unsubscribe from server if no trade subscriptions either
        if (!this.tradeSubscriptions.has(subscriptionKey)) {
          this.sendTradeUnsubscription(moderatorId, proposalId);
        }
      } else {
        this.chartPriceSubscriptions.set(subscriptionKey, callbacks);
      }
    }
  }

  public disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.cleanup();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    this.tradeSubscriptions.clear();
    this.poolAddresses.clear();
  }
}

// Singleton instance
let priceStreamInstance: PriceStreamService | null = null;

export function getPriceStreamService(wsUrl?: string): PriceStreamService {
  if (!priceStreamInstance) {
    priceStreamInstance = new PriceStreamService(
      wsUrl || process.env.NEXT_PUBLIC_WS_PRICE_URL || 'ws://localhost:9091'
    );
  }
  return priceStreamInstance;
}