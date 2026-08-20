import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

const UA = "Mozilla/5.0 (compatible; finance-mcp/0.1; +https://github.com/aimanhk2023-chencc/finance-mcp)";

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json,text/plain,*/*"
    }
  });
  if (!response.ok) {
    throw new Error(`Upstream request failed (${response.status}) for ${new URL(url).hostname}`);
  }
  return await response.json();
}

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function cleanTicker(value: string) {
  const ticker = value.trim().toUpperCase();
  if (!/^[A-Z0-9.^=\-]{1,20}$/.test(ticker)) throw new Error("Invalid ticker symbol");
  return ticker;
}

async function yahooChart(ticker: string, range = "1d", interval = "1m") {
  const symbol = encodeURIComponent(cleanTicker(ticker));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&includePrePost=true&events=div%2Csplits`;
  const data = await getJson(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description ?? "No chart data returned");
  return result;
}

async function quoteOne(ticker: string) {
  const result = await yahooChart(ticker, "1d", "1m");
  const m = result.meta ?? {};
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const i = Math.max(0, timestamps.length - 1);
  return {
    symbol: m.symbol ?? cleanTicker(ticker),
    currency: m.currency,
    exchange: m.exchangeName,
    marketState: m.marketState,
    price: m.regularMarketPrice,
    previousClose: m.chartPreviousClose ?? m.previousClose,
    dayHigh: m.regularMarketDayHigh,
    dayLow: m.regularMarketDayLow,
    volume: m.regularMarketVolume ?? quote.volume?.[i],
    bid: m.bid,
    ask: m.ask,
    lastTimestamp: timestamps[i] ?? m.regularMarketTime,
    timezone: m.exchangeTimezoneName,
    source: "Yahoo Finance chart endpoint (unofficial)",
    note: "Market-data latency depends on exchange and upstream entitlement; do not assume tick-by-tick real time."
  };
}

function createServer() {
  const server = new McpServer({ name: "finance-mcp", version: "0.1.0" });

  server.registerTool(
    "stock_quote",
    {
      description: "Get latest/near-real-time quote metadata for up to 10 tickers. Useful for US equities, ETFs and Yahoo-supported symbols.",
      inputSchema: {
        symbols: z.array(z.string()).min(1).max(10).describe("Ticker symbols, e.g. AAPL, NVDA, SOXL")
      }
    },
    async ({ symbols }) => text(await Promise.all(symbols.map(quoteOne)))
  );

  server.registerTool(
    "price_history",
    {
      description: "Get OHLCV price history from Yahoo Finance. Supports intraday and daily intervals where Yahoo permits them.",
      inputSchema: {
        symbol: z.string(),
        range: z.enum(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]).default("1mo"),
        interval: z.enum(["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]).default("1d")
      }
    },
    async ({ symbol, range, interval }) => {
      const r = await yahooChart(symbol, range, interval);
      const q = r.indicators?.quote?.[0] ?? {};
      const adj = r.indicators?.adjclose?.[0]?.adjclose ?? [];
      const rows = (r.timestamp ?? []).map((ts: number, i: number) => ({
        timestamp: ts,
        open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i],
        adjClose: adj?.[i], volume: q.volume?.[i]
      }));
      return text({ symbol: r.meta?.symbol, currency: r.meta?.currency, range, interval, rows, source: "Yahoo Finance chart endpoint (unofficial)" });
    }
  );

  server.registerTool(
    "option_chain",
    {
      description: "Get Yahoo Finance option expirations and call/put chains. Option quotes may be delayed and availability can vary by region/upstream anti-bot rules.",
      inputSchema: {
        symbol: z.string(),
        expiration: z.number().int().positive().optional().describe("Unix expiration timestamp. Omit to fetch the nearest available expiration."),
        maxContracts: z.number().int().min(1).max(200).default(80)
      }
    },
    async ({ symbol, expiration, maxContracts }) => {
      const ticker = encodeURIComponent(cleanTicker(symbol));
      const suffix = expiration ? `?date=${expiration}` : "";
      const data = await getJson(`https://query2.finance.yahoo.com/v7/finance/options/${ticker}${suffix}`);
      const r = data?.optionChain?.result?.[0];
      if (!r) throw new Error(data?.optionChain?.error?.description ?? "No option-chain data returned");
      const option = r.options?.[0] ?? {};
      const slim = (items: any[]) => (items ?? []).slice(0, maxContracts).map((x: any) => ({
        contractSymbol: x.contractSymbol, strike: x.strike, lastPrice: x.lastPrice,
        bid: x.bid, ask: x.ask, change: x.change, percentChange: x.percentChange,
        volume: x.volume, openInterest: x.openInterest, impliedVolatility: x.impliedVolatility,
        inTheMoney: x.inTheMoney, expiration: x.expiration, lastTradeDate: x.lastTradeDate
      }));
      return text({
        symbol: r.quote?.symbol ?? cleanTicker(symbol),
        underlyingPrice: r.quote?.regularMarketPrice,
        expirationDates: r.expirationDates,
        selectedExpiration: option.expirationDate,
        calls: slim(option.calls), puts: slim(option.puts),
        source: "Yahoo Finance options endpoint (unofficial)",
        note: "Options data may be delayed. Verify execution decisions against your broker/order book."
      });
    }
  );

  server.registerTool(
    "finance_news",
    {
      description: "Search Yahoo Finance for ticker/company news and matching securities.",
      inputSchema: {
        query: z.string().min(1).max(100),
        newsCount: z.number().int().min(1).max(20).default(8)
      }
    },
    async ({ query, newsCount }) => {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=${newsCount}`;
      const d = await getJson(url);
      return text({
        query,
        quotes: (d.quotes ?? []).map((x: any) => ({ symbol: x.symbol, name: x.shortname ?? x.longname, exchange: x.exchange, type: x.quoteType })),
        news: (d.news ?? []).map((x: any) => ({ title: x.title, publisher: x.publisher, publishedAt: x.providerPublishTime, link: x.link, type: x.type })),
        source: "Yahoo Finance search/news endpoint (unofficial)"
      });
    }
  );

  server.registerTool(
    "market_snapshot",
    {
      description: "Get a compact US market snapshot for S&P 500, Nasdaq Composite, Dow Jones and VIX.",
      inputSchema: {}
    },
    async () => text(await Promise.all(["^GSPC", "^IXIC", "^DJI", "^VIX"].map(quoteOne)))
  );

  return server;
}

const mcp = createMcpHandler(createServer);

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ ok: true, service: "finance-mcp", version: "0.1.0", mcp: "/mcp" });
    }
    if (url.pathname === "/mcp") return mcp(request, env, ctx);
    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler;
