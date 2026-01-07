# Monitor
A TypeScript Express server that manages the lifecycle of decision markets running on Combinator's `Futarchy` program.

## Scope
This server handles automated tasks that must run periodically within a proposal's lifetime:

1. **Listen** for `ProposalLaunched` / `ProposalFinalized` events on-chain (only for tracked moderators)
2. **Crank** TWAP oracles every ~60 seconds for managed proposals
3. **Finalize**, **Redeem Liquidity**, & **Deposit Back** when proposals expire
4. **Broadcast** trade events & price updates for spot & conditional markets via SSE
5. **Log** failures for analysis / manual resolution

## Endpoints (Key-gated)

### `GET /status`
Returns monitor status and tracked proposals.

```json
{
  "monitored": 2,
  "proposals": [
    {
      "pda": "ABC123...",
      "id": 1,
      "endsAt": "2025-01-15T12:00:00.000Z",
      "timeRemaining": 3600000
    }
  ]
}
```

### `GET /logs?file={lifecycle|server|twap|price}&limit=50`
Fetch error logs (newest first, default limit 50, max 500).

```json
{
  "file": "lifecycle",
  "count": 2,
  "entries": [
    { "timestamp": "...", "proposalPda": "...", "error": "..." }
  ]
}
```

### `POST /clean?file={lifecycle|server|twap|price}`
Clear error logs. Omit `file` param to clear all. 

## Usage
For development, run
```
npm run monitor:dev
```
which uses `tsx` with `--no-auth` to disable API key auth & `--dev` to write to dev db tables.

For production, run
```
npm run build && npm run monitor
```

**CLI Args**
| Arg         | Description                      |
|-------------|----------------------------------|
| `--port`    | Custom port (default: 4000)      |
| `--no-auth` | Disable API key authentication   |
| `--dev`     | Use dev database tables          |

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                              MONITOR                                  │
│                                                                       │
│   ┌─────────────┐                                                     │
│   │   Monitor   │◄──── On-chain Events                                │
│   │             │      (ProposalLaunched / ProposalFinalized)         │
│   └──────┬──────┘                                                     │
│          │                                                            │
│          │ subscribes                                                 │
│          ▼                                                            │
│   ┌────────────────────────────────────────────────────────────┐      │
│   │                        SERVER                              │      │
│   │                                                            │      │
│   │  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │      │
│   │  │   Lifecycle    │  │     TWAP     │  │     Price      │  │      │
│   │  │    Service     │  │    Service   │  │    Service     │  │      │
│   │  └───────┬────────┘  └──────┬───────┘  └───────┬────────┘  │      │
│   │          │                  │                  │           │      │
│   └──────────┼──────────────────┼──────────────────┼───────────┘      │
│              │                  │                  │                  │
└──────────────┼──────────────────┼──────────────────┼──────────────────┘
               │                  │                  │
               ▼                  ▼                  ▼
        ┌────────────┐     ┌────────────┐     ┌─────────────────┐
        │ Combinator │     │ Combinator │     │   SSE Clients   │
        │    API     │     │    API     │     │   Database      │
        └────────────┘     └────────────┘     │   On-chain      │
                                              └─────────────────┘
```

**Services**

| Service   | Trigger              | Action                                              |
|-----------|----------------------|-----------------------------------------------------|
| Lifecycle | Proposal launched    | Queues `finalize`, `redeem-liquidity`, & `deposit`  |
| TWAP      | Every minute (live)  | Cranks TWAP oracle via API                          |
| Price     | Market price changes | Broadcasts prices & trades via SSE                  |

## SSE Events

The `/events` endpoint broadcasts the following events:

| Event | Payload |
|-------|---------|
| `CONNECTED` | `{ clientId }` |
| `PRICE_UPDATE` | `{ proposalPda, market, price, marketCapUsd, timestamp }` |
| `COND_SWAP` | `{ proposalPda, pool, market, trader, swapAToB, amountIn, amountOut, txSignature, timestamp }` |
| `TWAP_UPDATE` | `{ proposalPda, pools: [{ pool, twap }], timestamp }` |

- `market = -1` indicates spot pool price, `market >= 0` indicates conditional pool index
