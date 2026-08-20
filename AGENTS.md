# Finance MCP project guidance

When the user asks for current market data, prefer the configured `finance` MCP tools over assumptions or stale knowledge.

Use:
- `stock_quote` for latest/near-real-time quotes.
- `price_history` for OHLCV history.
- `option_chain` for expirations, strikes, bid/ask, IV, volume and open interest.
- `finance_news` for current finance/company news discovery.
- `market_snapshot` for S&P 500, Nasdaq, Dow and VIX context.

Always state that free upstream market data may be delayed and is not execution-grade. For trading decisions, distinguish observed data from analysis and never imply broker-level tick accuracy.
