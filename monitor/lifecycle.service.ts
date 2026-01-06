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

import { Monitor, MonitoredProposal } from './monitor';

const API_URL = 'https://api.zcombinator.io';

/**
 * Schedules and executes proposal finalization when proposals expire.
 * Calls the DAO API to finalize, redeem liquidity, and deposit back.
 */
export class LifecycleService {
  private timers = new Map<string, NodeJS.Timeout>();

  /**
   * Subscribe to monitor events and schedule finalization for existing proposals
   */
  start(monitor: Monitor) {
    // Schedule existing proposals
    for (const proposal of monitor.getMonitored()) {
      this.scheduleFinalization(proposal);
    }

    // Listen for new proposals
    monitor.on('proposal:added', (proposal) => {
      this.scheduleFinalization(proposal);
    });

    // Cancel timer if proposal removed early (e.g., finalized by someone else)
    monitor.on('proposal:removed', (proposal) => {
      this.cancelFinalization(proposal.proposalPda);
    });

    console.log('Lifecycle service started');
  }

  stop() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    console.log('Lifecycle service stopped');
  }

  private scheduleFinalization(proposal: MonitoredProposal) {
    const delay = Math.max(0, proposal.endTime - Date.now());

    const timer = setTimeout(async () => {
      this.timers.delete(proposal.proposalPda);
      await this.runFinalizationFlow(proposal);
    }, delay);

    this.timers.set(proposal.proposalPda, timer);
    console.log(`Scheduled finalization for ${proposal.proposalPda} in ${Math.round(delay / 1000)}s`);
  }

  private cancelFinalization(pda: string) {
    const timer = this.timers.get(pda);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(pda);
      console.log(`Cancelled finalization for ${pda}`);
    }
  }

  private async runFinalizationFlow(proposal: MonitoredProposal) {
    const { proposalPda } = proposal;
    console.log(`Starting finalization flow for ${proposalPda}`);

    try {
      // Step 1: Finalize proposal
      const finalizeRes = await this.callApi('/dao/finalize-proposal', { proposal_pda: proposalPda });
      console.log(`Finalized: ${proposalPda} (winner: ${finalizeRes.winning_option})`);

      // Step 2: Redeem liquidity
      const redeemRes = await this.callApi('/dao/redeem-liquidity', { proposal_pda: proposalPda });
      console.log(`Redeemed liquidity: ${proposalPda} (tx: ${redeemRes.transaction})`);

      // Step 3: Deposit back
      const depositRes = await this.callApi('/dao/deposit-back', { proposal_pda: proposalPda });
      if (depositRes.skipped) {
        console.log(`Deposit-back skipped: ${proposalPda} (${depositRes.reason})`);
      } else {
        console.log(`Deposit-back complete: ${proposalPda}`);
      }

      console.log(`Finalization flow complete for ${proposalPda}`);
    } catch (error) {
      console.error(`Finalization flow failed for ${proposalPda}:`, error);
    }
  }

  private async callApi(endpoint: string, body: Record<string, string>): Promise<any> {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { error?: string; [key: string]: any };

    if (!res.ok) {
      throw new Error(data.error || `API error: ${res.status}`);
    }

    return data;
  }
}
