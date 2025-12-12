# Whitelisting New Tokens - Complete Setup Guide

This guide covers everything needed to add a new token to the decision market system with proper security isolation.

## Overview

Adding a new token requires:
1. Creating a dedicated manager wallet (authority keypair)
2. Configuring the wallet in both percent and zcombinator
3. Updating pool config (whitelist, metadata, ticker mapping) in `src/config/pools.ts`
4. **Running the create-moderator script** to create the moderator in database

---

## Step 1: Create Manager Wallet

Each token needs its own **manager wallet** for security isolation. If one token's wallet is compromised, other tokens remain safe.

### Generate Wallet Keypair

```bash
# Generate new Solana wallet
solana-keygen new --outfile wallet-newtoken.json

# Get the public key
solana-keygen pubkey wallet-newtoken.json
# Copy this public key - you'll need it for Step 3
```

**Save this wallet file securely!** This wallet will:
- Sign withdrawal transactions from the DAMM pool
- Hold tokens during active decision markets
- Automatically deposit back to the pool after DM finalization

---

## Step 2: Configure Manager Wallet in Backend

### 2a. percent Configuration

Add environment variable with the base58-encoded private key:

**File:** `percent/.env`

```bash
# Existing manager private keys (base58 encoded)
# This is the same wallet as MANAGER_WALLET_* in zcombinator
MANAGER_PRIVATE_KEY_ZC=<base58-private-key>
MANAGER_PRIVATE_KEY_OOGWAY=<base58-private-key>

# NEW: Add your token's manager private key
MANAGER_PRIVATE_KEY_NEWTOKEN=<base58-private-key>
```

**File:** `percent/src/config/pools.ts`

Update the `TICKER_TO_POOL` object:

```typescript
const TICKER_TO_POOL: Record<string, string> = {
  'ZC': 'CCZdbVvDqPN8DmMLVELfnt9G1Q9pQNt3bTGifSpUY9Ad',
  'OOGWAY': '2FCqTyvFcE4uXgRL1yh56riZ9vdjVgoP6yknZW3f8afX',
  'NEWTOKEN': 'YOUR_NEW_POOL_ADDRESS_HERE',  // ADD THIS LINE
};
```

Then add the whitelist and metadata entries in the same file.

### 2b. zcombinator Configuration

Add manager wallet and LP owner environment variables:

**File:** `zcombinator/ui/.env`

```bash
# Existing manager wallets (public keys)
MANAGER_WALLET_ZC=9x7FvP...
MANAGER_WALLET_OOGWAY=3h8Kq...

# NEW: Add your token's manager wallet public key
MANAGER_WALLET_NEWTOKEN=YOUR_PUBLIC_KEY_FROM_STEP1

# Existing LP owner private keys (base58 encoded)
LP_OWNER_PRIVATE_KEY_ZC=...
LP_OWNER_PRIVATE_KEY_OOGWAY=...

# NEW: Add your token's LP owner private key
LP_OWNER_PRIVATE_KEY_NEWTOKEN=YOUR_LP_OWNER_PRIVATE_KEY
```

**File:** `zcombinator/ui/routes/damm-liquidity.ts`

Update the `poolToTicker` mapping (lines 121-124):

```typescript
const poolToTicker: Record<string, string> = {
  'CCZdbVvDqPN8DmMLVELfnt9G1Q9pQNt3bTGifSpUY9Ad': 'ZC',
  '2FCqTyvFcE4uXgRL1yh56riZ9vdjVgoP6yknZW3f8afX': 'OOGWAY',
  'YOUR_NEW_POOL_ADDRESS_HERE': 'NEWTOKEN',  // ADD THIS LINE
};
```

The functions `getManagerWalletForPool()` and `getLpOwnerPrivateKeyForPool()` automatically construct env var names using this ticker (e.g., `MANAGER_WALLET_NEWTOKEN`, `LP_OWNER_PRIVATE_KEY_NEWTOKEN`).

---

## Step 3: Update Pool Configuration

**File:** `src/config/pools.ts`

This file is the single source of truth for all pool configuration in percent. Add entries to all three objects:

### 3a. Add to TICKER_TO_POOL

```typescript
const TICKER_TO_POOL: Record<string, string> = {
  'ZC': 'CCZdbVvDqPN8DmMLVELfnt9G1Q9pQNt3bTGifSpUY9Ad',
  'OOGWAY': '2FCqTyvFcE4uXgRL1yh56riZ9vdjVgoP6yknZW3f8afX',
  'SURF': 'Ez1QYeC95xJRwPA9SR7YWC1H1Tj43exJr91QqKf8Puu1',
  'NEWTOKEN': 'YOUR_NEW_POOL_ADDRESS_HERE',  // ADD THIS LINE
};
```

### 3b. Add to POOL_WHITELIST

```typescript
const POOL_WHITELIST: Record<string, string[]> = {
  // ... existing entries
  [TICKER_TO_POOL.NEWTOKEN]: [
    '79TLv4oneDA1tDUSNXBxNCnemzNmLToBHYXnfZWDQNeP',  // User wallet 1
    'BXc9g3zxbQhhfkLjxXbtSHrfd6MSFRdJo8pDQhW95QUw',  // User wallet 2
    // Add more authorized user wallets as needed
  ],
};
```

This whitelist controls which user wallets can create decision markets for this pool.

### 3c. Add to POOL_METADATA

```typescript
const POOL_METADATA: Record<string, PoolMetadata> = {
  // ... existing entries
  [TICKER_TO_POOL.NEWTOKEN]: {
    poolAddress: TICKER_TO_POOL.NEWTOKEN,
    ticker: 'newtoken',  // ⚠️ MUST BE UNIQUE! Used for routing (/newtoken)
    baseMint: 'YOUR_TOKEN_MINT_ADDRESS',
    quoteMint: 'So11111111111111111111111111111111111111112',  // SOL
    baseDecimals: 6,  // Check your token's decimals
    quoteDecimals: 9,  // SOL always 9
    moderatorId: 5,  // Next available ID (ZC=2, oogway=3, SURF=4)
    icon: 'https://your-token-icon-url.png',  // Optional
  },
};
```

**⚠️ CRITICAL:** The `ticker` field MUST be UNIQUE! It's used for routing:
- Frontend routes: `/newtoken`, `/newtoken/create`, `/newtoken/history`
- Check existing tickers before choosing one

---

## Step 4: Create Moderator in Database (REQUIRED)

Each token needs a moderator entry in the `qm_moderators` table. **This is required before proposals can be created** - without it, the API returns 404 "Moderator not found".

**Current moderator IDs:**
- **ZC**: `moderatorId: 2`
- **oogway**: `moderatorId: 3`
- **SURF**: `moderatorId: 4`

### Run the create-moderator script

**File:** `scripts/create-moderator.ts`

1. Update the token configuration in the script:
```typescript
// SURF token
const TICKER = 'SURF';
const BASE_MINT = 'SurfwRjQQFV6P7JdhxSptf4CjWU8sb88rUiaLCystar';
const BASE_DECIMALS = 9;
```

2. Set required environment variables:
```bash
export API_URL=http://localhost:3001  # or production URL
export API_KEY=<your-api-key>
export ENCRYPTION_KEY=<your-encryption-key>
export MANAGER_PRIVATE_KEY_SURF=<base58-private-key>  # same env var used at runtime
```

3. Run the script:
```bash
npx ts-node scripts/create-moderator.ts
```

The script will:
- Read the manager keypair from `MANAGER_PRIVATE_KEY_<TICKER>` env var
- Encrypt and send it to `POST /api/router/moderators`
- Create the moderator in `qm_moderators` table
- Add it to the in-memory map (no server restart needed)

**Note:** The script uses the **same env var** (`MANAGER_PRIVATE_KEY_<TICKER>`) that the server uses at runtime. This ensures the DB-stored authority matches the env var.

---

## Step 5: Verify Configuration

### Checklist Before Deploying

- [ ] Manager wallet keypair created
- [ ] Manager wallet public key copied
- [ ] `MANAGER_PRIVATE_KEY_NEWTOKEN` in percent `.env` (base58 private key)
- [ ] `MANAGER_WALLET_NEWTOKEN` in zcombinator `.env`
- [ ] `LP_OWNER_PRIVATE_KEY_NEWTOKEN` in zcombinator `.env`
- [ ] `TICKER_TO_POOL` updated in `src/config/pools.ts` (percent)
- [ ] `POOL_WHITELIST` updated in `src/config/pools.ts` (percent)
- [ ] `POOL_METADATA` updated in `src/config/pools.ts` (percent)
- [ ] `poolToTicker` updated in `damm-liquidity.ts` (zcombinator)
- [ ] Unique `moderatorId` assigned
- [ ] **Moderator created in `qm_moderators` table** (via API or SQL)
- [ ] Manager wallet funded with SOL for transaction fees

---

## Example: Adding "SHIRTLESS" Token

```typescript
// 1. Generate wallet
// solana-keygen new --outfile wallet-shirtless.json
// Public key: ShRt1essABC123... (example)
// Get base58 private key: solana-keygen export-private-key wallet-shirtless.json

// 2. percent/.env (base58 private key - same wallet as MANAGER_WALLET in zcombinator)
MANAGER_PRIVATE_KEY_SHIRTLESS=<base58-private-key>

// 3. zcombinator/.env
MANAGER_WALLET_SHIRTLESS=ShRt1essABC123...
LP_OWNER_PRIVATE_KEY_SHIRTLESS=<base58-encoded-private-key>

// 4. percent/src/config/pools.ts - Add to TICKER_TO_POOL
const TICKER_TO_POOL: Record<string, string> = {
  // ... existing entries
  'SHIRTLESS': '8qWx3PQrZKm9VNYu4ThJ6Kp5XmD2Hf7Lb1Rj3Cw6Sv9T',
};

// 5. percent/src/config/pools.ts - Add to POOL_WHITELIST
const POOL_WHITELIST: Record<string, string[]> = {
  // ... existing entries
  [TICKER_TO_POOL.SHIRTLESS]: [
    '79TLv4oneDA1tDUSNXBxNCnemzNmLToBHYXnfZWDQNeP',
    'BXc9g3zxbQhhfkLjxXbtSHrfd6MSFRdJo8pDQhW95QUw',
  ],
};

// 6. percent/src/config/pools.ts - Add to POOL_METADATA
const POOL_METADATA: Record<string, PoolMetadata> = {
  // ... existing entries
  [TICKER_TO_POOL.SHIRTLESS]: {
    poolAddress: TICKER_TO_POOL.SHIRTLESS,
    ticker: 'shirtless',
    baseMint: 'SHRT1ess...',
    quoteMint: 'So11111111111111111111111111111111111111112',
    baseDecimals: 6,
    quoteDecimals: 9,
    moderatorId: 5,  // Next available after SURF=4
    icon: 'https://shirtless.com/icon.png',
  },
};

// 7. zcombinator/ui/routes/damm-liquidity.ts - poolToTicker
const poolToTicker = {
  // ... existing entries
  '8qWx3PQrZKm9VNYu4ThJ6Kp5XmD2Hf7Lb1Rj3Cw6Sv9T': 'SHIRTLESS',
};

// 8. Create moderator in database (via API or direct SQL)
// POST /api/router/moderators with encrypted keypair
// OR direct SQL insert into qm_moderators table
```

Routes automatically available:
- `/shirtless` - Trading interface
- `/shirtless/create` - Create DM
- `/shirtless/history` - Price history
- `/shirtless/rank` - Leaderboard

---

## Team Communication Template

When asking the team to add a new token, provide:

**Subject:** Add [TOKEN_NAME] to Decision Markets

**Request:**
```
Please add support for [TOKEN_NAME] with the following setup:

1. Generate manager wallet:
   - Create new Solana keypair: wallet-[token].json
   - Send me the PUBLIC KEY (not the private key!)

2. Fund the wallet:
   - Transfer 0.5 SOL for transaction fees
   - Wallet address: [WILL_PROVIDE_AFTER_GENERATION]

3. Configuration needed:
   - Pool address: [YOUR_POOL_ADDRESS]
   - Token mint: [TOKEN_MINT_ADDRESS]
   - Decimals: [TOKEN_DECIMALS]
   - Ticker: [UNIQUE_TICKER] (for routing: /[ticker])
   - Icon URL: [OPTIONAL_ICON_URL]
   - Authorized wallets: [LIST_OF_USER_PUBLIC_KEYS]

4. Deploy to:
   - percent backend (update pools.ts, add env var)
   - zcombinator API (update damm-liquidity.ts, add env vars)

5. Run create-moderator script:
   - Update scripts/create-moderator.ts with token config
   - Run: npx ts-node scripts/create-moderator.ts

Once deployed, I'll test by creating a test DM.
```

---

## Summary

To whitelist a new token:
1. ✅ Generate dedicated manager wallet
2. ✅ Configure wallet in percent (`MANAGER_PRIVATE_KEY_<TICKER>` env var)
3. ✅ Configure wallet in zcombinator (`MANAGER_WALLET_<TICKER>`, `LP_OWNER_PRIVATE_KEY_<TICKER>`, `poolToTicker`)
4. ✅ Update `src/config/pools.ts` in percent (`TICKER_TO_POOL`, `POOL_WHITELIST`, `POOL_METADATA`)
5. ✅ **Run `scripts/create-moderator.ts`** to create moderator in database
6. ✅ Fund manager wallet with SOL

**Note:** `MANAGER_PRIVATE_KEY_<TICKER>` (percent) and `MANAGER_WALLET_<TICKER>` (zcombinator) are the **same wallet** - percent needs the private key, zcombinator only needs the public key.
