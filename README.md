# finance-mcp

A focused remote Model Context Protocol (MCP) server for market data, designed for Cloudflare Workers and AI clients such as ChatGPT/Codex.

## Tools

- `stock_quote` — latest / near-real-time quote metadata for up to 10 tickers
- `price_history` — OHLCV history with intraday and daily intervals
- `option_chain` — option expirations, calls, puts, IV, volume and open interest
- `finance_news` — company/ticker news search
- `market_snapshot` — S&P 500, Nasdaq Composite, Dow Jones and VIX snapshot

## Data sources

The first release uses Yahoo Finance public/unofficial endpoints. Exchange and upstream rules determine actual latency. Treat quotes as near-real-time unless your upstream entitlement explicitly guarantees real-time data. Options data may be delayed; verify execution decisions against your broker/order book.

## Local development

```bash
npm install
npm run dev
```

Health check:

```text
http://localhost:8787/health
```

MCP endpoint:

```text
http://localhost:8787/mcp
```

## Deploy to Cloudflare Workers

```bash
npm install
npx wrangler login
npm run deploy
```

After deployment, Wrangler returns a Workers URL. Your remote MCP endpoint is:

```text
https://<worker-name>.<account-subdomain>.workers.dev/mcp
```

Use `/health` to verify the Worker is reachable.

## Connect an MCP client

Configure the remote MCP URL ending in `/mcp`. This project uses Streamable HTTP through Cloudflare's stateless MCP handler.

## Example prompts

- `Get AAPL and NVDA latest quotes.`
- `Show AAPL 5-day 5-minute price history.`
- `Get the nearest AAPL option chain and identify the highest-volume calls and puts.`
- `Find the latest Apple finance news.`
- `Give me a US market snapshot.`

## Roadmap

Next modules can add SEC filings, FRED macro data, institutional holdings, insider transactions, Cboe/OPRA-capable option feeds and broker-grade real-time market data providers.
