const express = require('express');
const router = express.Router();

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 3600000; // 1 hour

async function fetchCrypto() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd&include_24hr_change=true');
    if (!res.ok) throw new Error('CoinGecko failed');
    const data = await res.json();
    return {
      BTC: { price: data.bitcoin?.usd ?? null, change24h: data.bitcoin?.usd_24h_change ?? null },
      ETH: { price: data.ethereum?.usd ?? null, change24h: data.ethereum?.usd_24h_change ?? null },
      SOL: { price: data.solana?.usd ?? null, change24h: data.solana?.usd_24h_change ?? null },
      XRP: { price: data.ripple?.usd ?? null, change24h: data.ripple?.usd_24h_change ?? null }
    };
  } catch (e) {
    return { BTC: null, ETH: null, SOL: null, XRP: null };
  }
}

async function fetchYahoo(symbol, label) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Yahoo ${symbol} failed`);
    const data = await res.json();
    const closes = data.chart.result[0].indicators.quote[0].close.filter(v => v != null);
    if (closes.length < 2) return null;
    const price = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const change24h = ((price - prev) / prev) * 100;
    return { price, change24h };
  } catch (e) {
    return null;
  }
}

async function fetchAllPrices() {
  const [crypto, nvda, tsla, sp500, gold, oil] = await Promise.all([
    fetchCrypto(),
    fetchYahoo('NVDA', 'NVDA'),
    fetchYahoo('TSLA', 'TSLA'),
    fetchYahoo('^GSPC', 'S&P 500'),
    fetchYahoo('GC=F', 'Gold'),
    fetchYahoo('CL=F', 'Oil')
  ]);

  return {
    crypto,
    stocks: { NVDA: nvda, TSLA: tsla, 'S&P 500': sp500 },
    commodities: { Gold: gold, Oil: oil },
    fetchedAt: new Date().toISOString()
  };
}

// GET /api/market — public, no auth required
router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    if (cache && (now - cacheTime) < CACHE_TTL) {
      return res.json(cache);
    }
    const data = await fetchAllPrices();
    cache = data;
    cacheTime = now;
    res.json(data);
  } catch (err) {
    console.error('Market fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

module.exports = router;
