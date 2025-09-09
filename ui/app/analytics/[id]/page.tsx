'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Info, TrendingUp, TrendingDown, Database, Activity, Clock, DollarSign, Layers, Hash } from 'lucide-react';

interface AnalyticsData {
  id: number;
  description: string;
  status: string;
  createdAt: string;
  finalizedAt?: string;
  proposalStatus: string;
  proposalLength: number;
  baseMint: string;
  quoteMint: string;
  authority: string;
  ammConfig?: {
    initialBaseAmount: string;
    initialQuoteAmount: string;
  };
  vaults: {
    base?: {
      state: string;
      passConditionalMint: string;
      failConditionalMint: string;
      escrow: string;
      passConditionalSupply: string;
      failConditionalSupply: string;
      escrowSupply: string;
    };
    quote?: {
      state: string;
      passConditionalMint: string;
      failConditionalMint: string;
      escrow: string;
      passConditionalSupply: string;
      failConditionalSupply: string;
      escrowSupply: string;
    };
  };
  amms: {
    pass?: {
      state: string;
      baseMint: string;
      quoteMint: string;
      pool?: string;
      price?: number;
    };
    fail?: {
      state: string;
      baseMint: string;
      quoteMint: string;
      pool?: string;
      price?: number;
    };
  };
  twap: {
    values?: {
      passTwap: number;
      failTwap: number;
      passAggregation: number;
      failAggregation: number;
    };
    status?: string;
    initialTwapValue: number;
    twapStartDelay: number;
    passThresholdBps: number;
    twapMaxObservationChangePerUpdate: number;
  };
}

export default function AnalyticsDashboard() {
  const params = useParams();
  const proposalId = params.id as string;
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics();
  }, [proposalId]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/analytics/${proposalId}`, {
        headers: {
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'test-api-key'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.status}`);
      }
      
      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  };

  const truncateAddress = (address: string) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatSupply = (supply: string) => {
    const num = parseFloat(supply);
    if (num === 0) return '0';
    if (num < 1000) return num.toFixed(2);
    if (num < 1000000) return `${(num / 1000).toFixed(2)}K`;
    return `${(num / 1000000).toFixed(2)}M`;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading analytics...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6">
          <p className="text-red-400">{error || 'Failed to load analytics'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics Dashboard</h1>
        <p className="text-gray-400">Proposal #{data.id}</p>
      </div>

      {/* Proposal Overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Info className="h-5 w-5" />
          Proposal Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              data.status === 'Pending' 
                ? 'bg-green-900/30 text-green-400' 
                : data.status === 'Passed'
                ? 'bg-blue-900/30 text-blue-400'
                : data.status === 'Failed'
                ? 'bg-red-900/30 text-red-400'
                : 'bg-gray-800 text-gray-400'
            }`}>
              {data.status}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Created At</p>
            <p className="font-mono text-sm">{new Date(data.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Proposal Length</p>
            <p className="font-semibold">{data.proposalLength} ms</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Authority</p>
            <p className="font-mono text-sm">{truncateAddress(data.authority)}</p>
          </div>
        </div>
        {data.description && (
          <div className="mt-4 p-3 bg-gray-800/50 rounded">
            <p className="text-sm text-gray-300">{data.description}</p>
          </div>
        )}
      </div>

      {/* AMM Prices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />
            Pass Market AMM
          </h2>
          {data.amms.pass ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">State</span>
                <span className="font-mono text-sm">{data.amms.pass.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Price</span>
                <span className="text-2xl font-bold text-green-500">
                  ${data.amms.pass.price?.toFixed(4) || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Pool</span>
                <span className="font-mono text-xs">{truncateAddress(data.amms.pass.pool || '')}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Not initialized</p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-500" />
            Fail Market AMM
          </h2>
          {data.amms.fail ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">State</span>
                <span className="font-mono text-sm">{data.amms.fail.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Price</span>
                <span className="text-2xl font-bold text-red-500">
                  ${data.amms.fail.price?.toFixed(4) || 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Pool</span>
                <span className="font-mono text-xs">{truncateAddress(data.amms.fail.pool || '')}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Not initialized</p>
          )}
        </div>
      </div>

      {/* Vault Supplies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Base Vault
          </h2>
          {data.vaults.base ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">State</span>
                <span className="font-mono text-sm">{data.vaults.base.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Pass Supply</span>
                <span className="font-semibold text-green-400">
                  {formatSupply(data.vaults.base.passConditionalSupply)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Fail Supply</span>
                <span className="font-semibold text-red-400">
                  {formatSupply(data.vaults.base.failConditionalSupply)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Escrow Supply</span>
                <span className="font-semibold">
                  {formatSupply(data.vaults.base.escrowSupply)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Not initialized</p>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Quote Vault
          </h2>
          {data.vaults.quote ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">State</span>
                <span className="font-mono text-sm">{data.vaults.quote.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Pass Supply</span>
                <span className="font-semibold text-green-400">
                  {formatSupply(data.vaults.quote.passConditionalSupply)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Fail Supply</span>
                <span className="font-semibold text-red-400">
                  {formatSupply(data.vaults.quote.failConditionalSupply)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-400">Escrow Supply</span>
                <span className="font-semibold">
                  {formatSupply(data.vaults.quote.escrowSupply)}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Not initialized</p>
          )}
        </div>
      </div>

      {/* TWAP Oracle */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5" />
          TWAP Oracle
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Pass TWAP</p>
            <p className="font-semibold text-green-400">
              {data.twap.values?.passTwap.toFixed(4) || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Fail TWAP</p>
            <p className="font-semibold text-red-400">
              {data.twap.values?.failTwap.toFixed(4) || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Pass Threshold</p>
            <p className="font-semibold">{(data.twap.passThresholdBps / 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Status</p>
            <p className="font-mono text-sm">{data.twap.status || 'N/A'}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Initial Value</p>
            <p className="font-mono text-sm">{data.twap.initialTwapValue}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Start Delay</p>
            <p className="font-mono text-sm">{data.twap.twapStartDelay} ms</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Max Observation Change</p>
            <p className="font-mono text-sm">{data.twap.twapMaxObservationChangePerUpdate}</p>
          </div>
        </div>
      </div>

      {/* Token Configuration */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5" />
          Token Configuration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Base Mint</p>
            <p className="font-mono text-sm break-all">{data.baseMint}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Quote Mint</p>
            <p className="font-mono text-sm break-all">{data.quoteMint}</p>
          </div>
        </div>
        {data.ammConfig && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Initial Base Amount</p>
              <p className="font-semibold">{formatSupply(data.ammConfig.initialBaseAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Initial Quote Amount</p>
              <p className="font-semibold">{formatSupply(data.ammConfig.initialQuoteAmount)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}