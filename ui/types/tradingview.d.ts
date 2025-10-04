/**
 * TradingView Charting Library Type Definitions
 * These are simplified type definitions for the charting library used in the application
 */

export interface Bar {
  time: number; // Unix timestamp in milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type ResolutionString =
  | '1'   // 1 minute
  | '5'   // 5 minutes
  | '15'  // 15 minutes
  | '60'  // 1 hour
  | '240' // 4 hours
  | '1D'  // 1 day
  | 'D';  // 1 day (alternative)

export interface HistoryCallback {
  (bars: Bar[], meta?: { noData: boolean }): void;
}

export interface ResolveCallback {
  (symbolInfo: LibrarySymbolInfo): void;
}

export interface ErrorCallback {
  (error: string): void;
}

export interface LibrarySymbolInfo {
  name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  exchange: string;
  listed_exchange: string;
  timezone: string;
  format: string;
  pricescale: number;
  minmov: number;
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  supported_resolutions: ResolutionString[];
  data_status?: string;
}

export interface SubscribeBarsCallback {
  (bar: Bar): void;
}

export interface DatafeedConfiguration {
  supported_resolutions?: ResolutionString[];
  exchanges?: Array<{
    value: string;
    name: string;
    desc: string;
  }>;
  symbols_types?: Array<{
    name: string;
    value: string;
  }>;
}