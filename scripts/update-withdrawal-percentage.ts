#!/usr/bin/env ts-node
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

/**
 * Update DAMM Withdrawal Percentage Script
 *
 * Usage:
 *   1. Update TICKER and NEW_PERCENTAGE below
 *   2. Run: pnpm tsx scripts/update-withdrawal-percentage.ts
 *
 * Environment:
 *   DB_URL - PostgreSQL connection string (required)
 *
 * Safety features:
 *   - Validates ticker exists in database
 *   - Validates percentage is within bounds (1-50)
 *   - Shows current value before update
 *   - Requires explicit confirmation via stdin
 *   - Uses database transaction
 *   - Verifies update was applied correctly
 */

import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import * as readline from 'readline';

dotenv.config();

// ============================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================
// Run this query to find moderator IDs:
//   SELECT id, config->>'baseMint' as base_mint, config->>'dammWithdrawalPercentage' as pct FROM qm_moderators;
const MODERATOR_ID = 5;
const NEW_PERCENTAGE = 50;
// ============================================================

// Bounds
const MIN_PERCENTAGE = 1;
const MAX_PERCENTAGE = 50;

interface ModeratorRow {
  id: number;
  protocol_name: string | null;
  config: {
    baseMint?: string;
    dammWithdrawalPercentage?: number;
    [key: string]: unknown;
  };
  updated_at: Date;
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function updateWithdrawalPercentage(): Promise<void> {
  // Use hardcoded values from top of file
  const moderatorId = MODERATOR_ID;
  const newPercentage = NEW_PERCENTAGE;

  // Validate moderator ID
  if (!Number.isInteger(moderatorId) || moderatorId < 1) {
    console.error(`Error: MODERATOR_ID must be a positive integer (got ${moderatorId})`);
    process.exit(1);
  }

  // Validate percentage bounds
  if (newPercentage < MIN_PERCENTAGE || newPercentage > MAX_PERCENTAGE) {
    console.error(`Error: Percentage must be between ${MIN_PERCENTAGE} and ${MAX_PERCENTAGE} (got ${newPercentage})`);
    process.exit(1);
  }

  // Validate environment
  const dbUrl = process.env.DB_URL;
  if (!dbUrl) {
    console.error('Error: DB_URL environment variable is required');
    process.exit(1);
  }

  // Create database connection
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  try {
    // Step 1: Fetch current moderator state
    console.log(`\nLooking up moderator with ID: ${moderatorId}`);

    const lookupResult = await pool.query<ModeratorRow>(
      'SELECT id, protocol_name, config, updated_at FROM qm_moderators WHERE id = $1',
      [moderatorId]
    );

    if (lookupResult.rows.length === 0) {
      console.error(`Error: No moderator found with ID ${moderatorId}`);
      console.error('\nAvailable moderators:');

      const allModerators = await pool.query<{ id: number; config: { baseMint?: string } }>(
        'SELECT id, config FROM qm_moderators ORDER BY id'
      );

      for (const mod of allModerators.rows) {
        console.error(`  - ID ${mod.id}: baseMint=${mod.config.baseMint?.slice(0, 8)}...`);
      }

      process.exit(1);
    }

    const moderator = lookupResult.rows[0];
    const currentPercentage = moderator.config.dammWithdrawalPercentage ?? 'not set (defaults to 12)';

    // Step 2: Display current state and proposed change
    const baseMint = moderator.config.baseMint;

    console.log('\n' + '='.repeat(60));
    console.log('CURRENT STATE');
    console.log('='.repeat(60));
    console.log(`  Moderator ID:        ${moderator.id}`);
    console.log(`  Base Mint:           ${baseMint || 'unknown'}`);
    console.log(`  Current Percentage:  ${currentPercentage}`);
    console.log(`  Last Updated:        ${moderator.updated_at.toISOString()}`);
    console.log('='.repeat(60));
    console.log('PROPOSED CHANGE');
    console.log('='.repeat(60));
    console.log(`  New Percentage:      ${newPercentage}%`);
    console.log('='.repeat(60));

    // Step 3: Check if already at target value
    if (moderator.config.dammWithdrawalPercentage === newPercentage) {
      console.log(`\nNo change needed - percentage is already set to ${newPercentage}%`);
      process.exit(0);
    }

    // Step 4: Require explicit confirmation
    const confirmString = `${moderator.id}`;
    const confirmation = await prompt(`\nType "${confirmString}" to confirm this update: `);

    if (confirmation !== confirmString) {
      console.log('\nUpdate cancelled - confirmation did not match');
      process.exit(1);
    }

    // Step 5: Perform update in transaction
    console.log('\nApplying update...');

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const updateResult = await client.query<ModeratorRow>(
        `UPDATE qm_moderators
         SET config = jsonb_set(config, '{dammWithdrawalPercentage}', $1::text::jsonb)
         WHERE id = $2
         RETURNING id, protocol_name, config, updated_at`,
        [newPercentage.toString(), moderator.id]
      );

      if (updateResult.rows.length !== 1) {
        throw new Error('Update did not return expected row count');
      }

      const updatedModerator = updateResult.rows[0];

      // Verify the update was applied correctly
      if (updatedModerator.config.dammWithdrawalPercentage !== newPercentage) {
        throw new Error(
          `Verification failed: expected ${newPercentage}, got ${updatedModerator.config.dammWithdrawalPercentage}`
        );
      }

      await client.query('COMMIT');

      // Step 6: Display success
      console.log('\n' + '='.repeat(60));
      console.log('UPDATE SUCCESSFUL');
      console.log('='.repeat(60));
      console.log(`  Moderator ID:        ${updatedModerator.id}`);
      console.log(`  Base Mint:           ${baseMint || 'unknown'}`);
      console.log(`  Previous Percentage: ${currentPercentage}`);
      console.log(`  New Percentage:      ${updatedModerator.config.dammWithdrawalPercentage}%`);
      console.log(`  Updated At:          ${updatedModerator.updated_at.toISOString()}`);
      console.log('='.repeat(60));
      console.log('\n✅ Update completed successfully\n');

    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  updateWithdrawalPercentage();
}

export { updateWithdrawalPercentage };
