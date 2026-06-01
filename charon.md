# Charon

## What Charon is

Charon is a Solana/Pump.fun trench-trading agent. It watches noisy token-flow signals, filters them through strategy rules, optionally asks an LLM to pick the best candidate, then routes approved trades through one of three modes:

- `dry_run`: simulated entries/exits stored in SQLite; no wallet trade.
- `confirm`: Telegram sends a trade intent and waits for manual approval.
- `live`: signs and executes Jupiter Ultra swaps automatically.

In this environment Charon is currently configured as a **dry-run Solana meme-token bot**, not a Polymarket bot.

## Current runtime shape

Observed repo: `/home/ubuntu/charon`

Current important config, redacted:

- `TRADING_MODE=dry_run`
- `SIGNAL_SERVER_URL=https://api.thecharon.xyz/api`
- `SIGNAL_POLL_MS=30000`
- `POSITION_CHECK_MS=10000`
- `ENABLE_LLM=true`
- `LLM_PROVIDER=openai_compatible`
- `LLM_MODEL=google/gemma-4-31b-it:free`
- `GMGN_ENABLED=true`
- DB: `./charon.sqlite`
- Telegram, signal server, Helius, GMGN, Solana private key, and Jupiter credentials are present in `.env`, but secrets must not be printed.

Current active strategy observed from SQLite:

- Strategy: `sniper`
- Uses LLM: `true`
- Market-cap window: `$7,000` to `$200,000`
- Minimum GMGN total fees: `10 SOL`
- Max open positions: `3`
- Position size: `0.1 SOL`
- TP: `200%`
- SL: `-90%`
- Trailing enabled: `true`

## High-level workflow

1. **Startup**
   - `npm start` runs `node index.js`.
   - `src/app.js` validates config, initializes SQLite, initializes live-execution support if wallet credentials exist, starts Telegram command handling, then starts signal polling and position monitoring.

2. **Signal intake**
   - In current server mode, Charon polls the Charon signal server every `SIGNAL_POLL_MS`.
   - The signal server aggregates token events such as fee-claim, graduated-token, and trending-token signals.
   - Logs look like:
     - `[server] 76 signals, 0 triggered, tracking 499`
     - `[candidate] filtered ... market cap max: ... > 200000`

3. **Candidate building**
   - `src/pipeline/candidateBuilder.js` builds a candidate from raw signals.
   - It enriches candidates with:
     - GMGN token info and fees
     - Jupiter asset info
     - Jupiter holder data
     - Jupiter chart context / ATH distance
     - saved-wallet exposure
     - Twitter/narrative metadata when available

4. **Strategy filters**
   - `filterCandidate()` applies the active SQLite strategy.
   - Typical gates include:
     - fee-claim requirement / minimum fee claim
     - market-cap min/max
     - GMGN total fees
     - graduated volume
     - holder count
     - top-holder concentration
     - saved-wallet holders
     - ATH-distance / dip criteria
     - trending volume, swaps, rug ratio, bundler rate, wash trading
     - optional fee/TVL + dump guard
   - If a candidate fails, it is logged and not sent to execution.

5. **LLM selection**
   - If `use_llm=true`, Charon takes recent eligible candidates and calls the configured LLM.
   - The LLM returns a batch decision such as `BUY`, `WATCH`, or no selection, with confidence and reasoning.
   - A candidate must pass both strategy filters and the LLM confidence threshold before entry.
   - If the strategy has `use_llm=false`, passing candidates can be auto-approved without an LLM call.

6. **Execution routing**
   - Approved buys go through `handleApprovedBuy()` in `src/pipeline/orchestrator.js`.
   - The selected candidate is refreshed before execution using fresh GMGN/Jupiter/holder/chart data.
   - If the refreshed candidate no longer passes filters, execution is rejected before opening a position.
   - Then Charon routes by `TRADING_MODE`:
     - `dry_run`: creates a simulated position in SQLite.
     - `confirm`: creates a pending Telegram trade intent.
     - `live`: calls Jupiter execution through `src/execution/router.js` and `src/liveExecutor.js`.

7. **Live execution path**
   - Live mode requires:
     - `SOLANA_PRIVATE_KEY`
     - `JUPITER_API_KEY`
     - Solana RPC / Helius config
   - Charon uses Jupiter Ultra:
     - request Jupiter order
     - deserialize transaction
     - sign with local Solana wallet
     - submit to Jupiter execute endpoint
   - `LIVE_MIN_SOL_RESERVE` protects wallet SOL reserve.

8. **Position monitoring**
   - `monitorPositions()` runs every `POSITION_CHECK_MS`.
   - It refreshes open positions with Jupiter market data.
   - It updates high-water market cap/price and checks:
     - take profit
     - stop loss
     - trailing TP
     - max hold time
     - partial TP rules
   - In dry-run mode, exits are recorded in SQLite.
   - In live mode, sell exits are executed through Jupiter before recording final realized values.

9. **Telegram control plane**
   - Telegram is both alerting and control UI.
   - Commands include:
     - `/menu`
     - `/strategy`
     - `/stratset <strategy_id> <key> <value>`
     - `/positions`
     - `/candidate <mint>`
     - `/filters`
     - `/pnl`
     - `/learn <window>`
     - `/lessons`
     - `/walletadd`, `/walletremove`, `/wallets`
   - Only the configured Telegram chat is accepted.

10. **Storage**
   - SQLite file: `charon.sqlite`
   - Stores:
     - candidates and snapshots
     - LLM decisions and batch decisions
     - decision logs and guardrail events
     - dry-run/live positions and trades
     - trade intents
     - saved wallets
     - strategy configs
     - price alerts
     - learning runs and lessons

## Current operational interpretation

Charon is running in server mode and mostly filtering candidates. Recent logs show repeated signal batches and some candidates rejected by the active `sniper` strategy, especially market cap exceeding the `$200k` max. This is not automatically a crash; it means the bot is alive but strict filters are suppressing many entries.

Because `TRADING_MODE=dry_run`, Charon should not execute real Jupiter swaps even though wallet/Jupiter credentials are present. Do not switch Charon to `live` without explicit approval and a separate live-readiness audit.

## Safe operations checklist

Before making changes:

1. Verify exact process/PID and runtime mode.
2. Redact `.env` secrets; only report `[present]` or `[missing]`.
3. Check logs for fatal errors separately from normal provider noise.
4. Inspect SQLite state before claiming “no trades” or “no signals.”
5. Walk the funnel:
   - signals received
   - candidates built
   - filters passed/failed
   - LLM selected/rejected
   - guardrails approved/rejected
   - execution created/skipped/failed
   - position monitor exited/held
6. Preserve runtime state: if Charon was running before a patch, restart it afterward or ask before leaving it stopped.

## Common blockers

- Candidate market cap below min or above max.
- GMGN total fees below active strategy threshold.
- Max open positions reached.
- Candidate selected by LLM but confidence below threshold.
- Fresh pre-execution refresh fails filters.
- Jupiter/GMGN/Helius rate limits degrade freshness.
- In live mode, missing private key, Jupiter key, RPC, or insufficient SOL reserve blocks execution.

## Useful commands

From `/home/ubuntu/charon`:

```bash
npm start
npm test
npm run check
```

Check process:

```bash
pgrep -af 'charon|node index.js|npm start' | grep -v grep
```

Tail logs:

```bash
tail -n 200 logs/charon-codex.log
```

Safe active strategy check:

```bash
node - <<'NODE'
import('./src/db/settings.js').then(m => {
  console.log(JSON.stringify(m.activeStrategy(), null, 2));
});
NODE
```

## Short version

Charon is a Telegram-controlled Solana memecoin trading agent. It polls a token-signal server, enriches token candidates, filters them through the active SQLite strategy, optionally asks an LLM to choose a BUY, then opens/monitors positions in dry-run, confirm, or live mode. Current deployment is running in `dry_run` with the `sniper` strategy, so it is screening live market flow but not executing real swaps.
