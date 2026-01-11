-- Zcombinator/Futarchy schema with cmb_ prefix
-- For tracking price/TWAP/trade history of futarchy proposals

-- Price History
CREATE TABLE IF NOT EXISTS cmb_price_history (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proposal_pda VARCHAR(64) NOT NULL,
  market INTEGER NOT NULL,  -- -1 for spot, 0/1/... for conditional pools
  price NUMERIC(20,10) NOT NULL,
  market_cap_usd NUMERIC(20,10)
);

CREATE INDEX IF NOT EXISTS idx_cmb_price_history_proposal_market
  ON cmb_price_history(proposal_pda, market);
CREATE INDEX IF NOT EXISTS idx_cmb_price_history_proposal_timestamp
  ON cmb_price_history(proposal_pda, timestamp DESC);

-- Trade History
CREATE TABLE IF NOT EXISTS cmb_trade_history (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proposal_pda VARCHAR(64) NOT NULL,
  market INTEGER NOT NULL,
  trader VARCHAR(64) NOT NULL,
  is_base_to_quote BOOLEAN NOT NULL,
  amount_in NUMERIC(20,10) NOT NULL,
  amount_out NUMERIC(20,10) NOT NULL,
  fee_amount NUMERIC(20,10),
  tx_signature VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_cmb_trade_history_proposal_timestamp
  ON cmb_trade_history(proposal_pda, timestamp DESC);

-- TWAP History
CREATE TABLE IF NOT EXISTS cmb_twap_history (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proposal_pda VARCHAR(64) NOT NULL,
  twaps NUMERIC(20,10)[] NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cmb_twap_history_proposal_timestamp
  ON cmb_twap_history(proposal_pda, timestamp DESC);

-- WebSocket notification for prices
CREATE OR REPLACE FUNCTION notify_cmb_new_price()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('cmb_new_price', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cmb_price_notification_trigger ON cmb_price_history;
CREATE TRIGGER cmb_price_notification_trigger
  AFTER INSERT ON cmb_price_history
  FOR EACH ROW
  EXECUTE FUNCTION notify_cmb_new_price();

-- WebSocket notification for trades
CREATE OR REPLACE FUNCTION notify_cmb_new_trade()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('cmb_new_trade', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cmb_trade_notification_trigger ON cmb_trade_history;
CREATE TRIGGER cmb_trade_notification_trigger
  AFTER INSERT ON cmb_trade_history
  FOR EACH ROW
  EXECUTE FUNCTION notify_cmb_new_trade();
