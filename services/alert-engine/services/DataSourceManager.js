const axios = require('axios');
const { MarketData } = require('../models');
const { cache } = require('../config/database');
const { logger, performanceLogger, utils } = require('../utils');

class DataSourceManager {
  constructor() {
    this.dataSources = {
      binance: {
        name: 'Binance',
        baseUrl: 'https://api.binance.com/api/v3',
        rateLimit: 1200, // requests per minute
        lastRequest: 0,
        enabled: true
      },
      coinbase: {
        name: 'Coinbase Pro',
        baseUrl: 'https://api.pro.coinbase.com',
        rateLimit: 10, // requests per second
        lastRequest: 0,
        enabled: true
      },
      coingecko: {
        name: 'CoinGecko',
        baseUrl: 'https://api.coingecko.com/api/v3',
        apiKey: process.env.COINGECKO_API_KEY,
        rateLimit: 50, // requests per minute for free tier
        lastRequest: 0,
        enabled: true
      },
      alphavantage: {
        name: 'Alpha Vantage',
        baseUrl: 'https://www.alphavantage.co/query',
        apiKey: process.env.ALPHA_VANTAGE_API_KEY,
        rateLimit: 5, // requests per minute for free tier
        lastRequest: 0,
        enabled: !!process.env.ALPHA_VANTAGE_API_KEY
      },
      finnhub: {
        name: 'Finnhub',
        baseUrl: 'https://finnhub.io/api/v1',
        apiKey: process.env.FINNHUB_API_KEY,
        rateLimit: 60, // requests per minute for free tier
        lastRequest: 0,
        enabled: !!process.env.FINNHUB_API_KEY
      }
    };
    
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    this.cacheTimeout = 60; // seconds
    
    this.setupAxiosDefaults();
  }

  /**
   * Setup axios defaults
   */
  setupAxiosDefaults() {
    axios.defaults.timeout = 10000;
    axios.defaults.headers.common['User-Agent'] = 'AlertBot/1.0';
  }

  /**
   * Fetch market data for a symbol
   */
  async fetchMarketData(symbol, exchange = 'BINANCE', forceRefresh = false) {
    const timer = performanceLogger.start('market_data_fetch', { symbol, exchange });
    
    try {
      // Check cache first
      if (!forceRefresh) {
        const cached = await this.getCachedData(symbol, exchange);
        if (cached) {
          timer.end();
          return cached;
        }
      }
      
      let marketData;
      
      switch (exchange.toUpperCase()) {
        case 'BINANCE':
          marketData = await this.fetchFromBinance(symbol);
          break;
        case 'COINBASE':
          marketData = await this.fetchFromCoinbase(symbol);
          break;
        case 'COINGECKO':
          marketData = await this.fetchFromCoinGecko(symbol);
          break;
        default:
          throw new Error(`Unsupported exchange: ${exchange}`);
      }
      
      if (marketData) {
        // Save to database
        await this.saveMarketData(marketData);
        
        // Cache the data
        await this.cacheMarketData(marketData);
      }
      
      return marketData;
      
    } catch (error) {
      logger.error(`Error fetching market data for ${symbol} from ${exchange}:`, error);
      
      // Try fallback exchange
      if (exchange !== 'BINANCE') {
        logger.info(`Trying fallback exchange for ${symbol}`);
        return await this.fetchMarketData(symbol, 'BINANCE', forceRefresh);
      }
      
      throw error;
    } finally {
      timer.end();
    }
  }

  /**
   * Fetch data from Binance
   */
  async fetchFromBinance(symbol) {
    try {
      await this.respectRateLimit('binance');
      
      const formattedSymbol = this.formatSymbolForBinance(symbol);
      
      // Fetch ticker data
      const tickerResponse = await axios.get(
        `${this.dataSources.binance.baseUrl}/ticker/24hr`,
        { params: { symbol: formattedSymbol } }
      );
      
      // Fetch kline data for OHLCV
      const klineResponse = await axios.get(
        `${this.dataSources.binance.baseUrl}/klines`,
        {
          params: {
            symbol: formattedSymbol,
            interval: '1h',
            limit: 24
          }
        }
      );
      
      // Fetch order book
      const orderBookResponse = await axios.get(
        `${this.dataSources.binance.baseUrl}/depth`,
        {
          params: {
            symbol: formattedSymbol,
            limit: 100
          }
        }
      );
      
      return this.transformBinanceData(tickerResponse.data, klineResponse.data, orderBookResponse.data, symbol);
      
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Binance rate limit exceeded');
        await utils.sleep(1000);
        throw new Error('Rate limit exceeded');
      }
      throw error;
    }
  }

  /**
   * Fetch data from Coinbase
   */
  async fetchFromCoinbase(symbol) {
    try {
      await this.respectRateLimit('coinbase');
      
      const formattedSymbol = this.formatSymbolForCoinbase(symbol);
      
      // Fetch ticker data
      const tickerResponse = await axios.get(
        `${this.dataSources.coinbase.baseUrl}/products/${formattedSymbol}/ticker`
      );
      
      // Fetch 24hr stats
      const statsResponse = await axios.get(
        `${this.dataSources.coinbase.baseUrl}/products/${formattedSymbol}/stats`
      );
      
      // Fetch candles for OHLCV
      const candlesResponse = await axios.get(
        `${this.dataSources.coinbase.baseUrl}/products/${formattedSymbol}/candles`,
        {
          params: {
            granularity: 3600, // 1 hour
            start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString()
          }
        }
      );
      
      return this.transformCoinbaseData(tickerResponse.data, statsResponse.data, candlesResponse.data, symbol);
      
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Coinbase rate limit exceeded');
        await utils.sleep(1000);
        throw new Error('Rate limit exceeded');
      }
      throw error;
    }
  }

  /**
   * Fetch data from CoinGecko
   */
  async fetchFromCoinGecko(symbol) {
    try {
      await this.respectRateLimit('coingecko');
      
      const coinId = this.getCoinGeckoId(symbol);
      
      const headers = {};
      if (this.dataSources.coingecko.apiKey) {
        headers['X-CG-Pro-API-Key'] = this.dataSources.coingecko.apiKey;
      }
      
      // Fetch coin data
      const coinResponse = await axios.get(
        `${this.dataSources.coingecko.baseUrl}/coins/${coinId}`,
        {
          headers,
          params: {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: false,
            developer_data: false,
            sparkline: false
          }
        }
      );
      
      // Fetch OHLC data
      const ohlcResponse = await axios.get(
        `${this.dataSources.coingecko.baseUrl}/coins/${coinId}/ohlc`,
        {
          headers,
          params: {
            vs_currency: 'usd',
            days: 1
          }
        }
      );
      
      return this.transformCoinGeckoData(coinResponse.data, ohlcResponse.data, symbol);
      
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('CoinGecko rate limit exceeded');
        await utils.sleep(60000); // Wait 1 minute
        throw new Error('Rate limit exceeded');
      }
      throw error;
    }
  }

  /**
   * Transform Binance data to our format
   */
  transformBinanceData(ticker, klines, orderBook, symbol) {
    const latestKline = klines[klines.length - 1];
    
    return {
      symbol: symbol.toUpperCase(),
      exchange: 'BINANCE',
      baseAsset: symbol.replace(/USDT$|BTC$|ETH$|BNB$/, ''),
      quoteAsset: symbol.match(/USDT$|BTC$|ETH$|BNB$/)?.[0] || 'USDT',
      currentPrice: parseFloat(ticker.lastPrice),
      dataSource: 'binance',
      lastUpdated: new Date(),
      
      // OHLCV data
      ohlcv: {
        open: parseFloat(latestKline[1]),
        high: parseFloat(latestKline[2]),
        low: parseFloat(latestKline[3]),
        close: parseFloat(latestKline[4]),
        volume: parseFloat(latestKline[5]),
        timestamp: new Date(latestKline[0])
      },
      
      // Market statistics
      marketStats: {
        priceChange24h: parseFloat(ticker.priceChange),
        priceChangePercent24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.volume),
        quoteVolume24h: parseFloat(ticker.quoteVolume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        openPrice24h: parseFloat(ticker.openPrice),
        count: parseInt(ticker.count)
      },
      
      // Order book
      orderBook: {
        bids: orderBook.bids.slice(0, 10).map(bid => ({
          price: parseFloat(bid[0]),
          quantity: parseFloat(bid[1])
        })),
        asks: orderBook.asks.slice(0, 10).map(ask => ({
          price: parseFloat(ask[0]),
          quantity: parseFloat(ask[1])
        })),
        spread: parseFloat(orderBook.asks[0][0]) - parseFloat(orderBook.bids[0][0]),
        timestamp: new Date()
      },
      
      // Quality metrics
      quality: {
        dataAge: 0,
        completeness: 1.0,
        accuracy: 0.95,
        source: 'binance'
      }
    };
  }

  /**
   * Transform Coinbase data to our format
   */
  transformCoinbaseData(ticker, stats, candles, symbol) {
    const latestCandle = candles[0]; // Coinbase returns newest first
    
    return {
      symbol: symbol.toUpperCase(),
      exchange: 'COINBASE',
      baseAsset: symbol.split('-')[0],
      quoteAsset: symbol.split('-')[1] || 'USD',
      currentPrice: parseFloat(ticker.price),
      dataSource: 'coinbase',
      lastUpdated: new Date(),
      
      // OHLCV data
      ohlcv: {
        open: parseFloat(latestCandle[3]),
        high: parseFloat(latestCandle[2]),
        low: parseFloat(latestCandle[1]),
        close: parseFloat(latestCandle[4]),
        volume: parseFloat(latestCandle[5]),
        timestamp: new Date(latestCandle[0] * 1000)
      },
      
      // Market statistics
      marketStats: {
        priceChange24h: parseFloat(stats.last) - parseFloat(stats.open),
        priceChangePercent24h: ((parseFloat(stats.last) - parseFloat(stats.open)) / parseFloat(stats.open)) * 100,
        volume24h: parseFloat(stats.volume),
        high24h: parseFloat(stats.high),
        low24h: parseFloat(stats.low),
        openPrice24h: parseFloat(stats.open)
      },
      
      // Quality metrics
      quality: {
        dataAge: Date.now() - new Date(ticker.time).getTime(),
        completeness: 0.9,
        accuracy: 0.93,
        source: 'coinbase'
      }
    };
  }

  /**
   * Transform CoinGecko data to our format
   */
  transformCoinGeckoData(coin, ohlc, symbol) {
    const marketData = coin.market_data;
    const latestOhlc = ohlc[ohlc.length - 1];
    
    return {
      symbol: symbol.toUpperCase(),
      exchange: 'COINGECKO',
      baseAsset: coin.symbol.toUpperCase(),
      quoteAsset: 'USD',
      currentPrice: marketData.current_price.usd,
      dataSource: 'coingecko',
      lastUpdated: new Date(),
      
      // OHLCV data
      ohlcv: {
        open: latestOhlc[1],
        high: latestOhlc[2],
        low: latestOhlc[3],
        close: latestOhlc[4],
        volume: marketData.total_volume.usd,
        timestamp: new Date(latestOhlc[0])
      },
      
      // Market statistics
      marketStats: {
        priceChange24h: marketData.price_change_24h,
        priceChangePercent24h: marketData.price_change_percentage_24h,
        volume24h: marketData.total_volume.usd,
        marketCap: marketData.market_cap.usd,
        circulatingSupply: marketData.circulating_supply,
        totalSupply: marketData.total_supply,
        maxSupply: marketData.max_supply,
        high24h: marketData.high_24h.usd,
        low24h: marketData.low_24h.usd
      },
      
      // Quality metrics
      quality: {
        dataAge: Date.now() - new Date(marketData.last_updated).getTime(),
        completeness: 0.95,
        accuracy: 0.90,
        source: 'coingecko'
      }
    };
  }

  /**
   * Format symbol for Binance API
   */
  formatSymbolForBinance(symbol) {
    // Convert symbols like BTC/USDT to BTCUSDT
    return symbol.replace('/', '').toUpperCase();
  }

  /**
   * Format symbol for Coinbase API
   */
  formatSymbolForCoinbase(symbol) {
    // Convert symbols like BTC/USD to BTC-USD
    return symbol.replace('/', '-').toUpperCase();
  }

  /**
   * Get CoinGecko coin ID from symbol
   */
  getCoinGeckoId(symbol) {
    const symbolMap = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'ADA': 'cardano',
      'DOT': 'polkadot',
      'LINK': 'chainlink',
      'LTC': 'litecoin',
      'BCH': 'bitcoin-cash',
      'XLM': 'stellar',
      'DOGE': 'dogecoin',
      'UNI': 'uniswap',
      'AAVE': 'aave',
      'SUSHI': 'sushi',
      'COMP': 'compound-governance-token',
      'MKR': 'maker',
      'SNX': 'synthetix-network-token'
    };
    
    const baseSymbol = symbol.replace(/\/.*$/, '').toUpperCase();
    return symbolMap[baseSymbol] || baseSymbol.toLowerCase();
  }

  /**
   * Respect rate limits for data sources
   */
  async respectRateLimit(source) {
    const sourceConfig = this.dataSources[source];
    if (!sourceConfig) return;
    
    const now = Date.now();
    const timeSinceLastRequest = now - sourceConfig.lastRequest;
    
    let minInterval;
    if (source === 'coinbase') {
      minInterval = 1000 / sourceConfig.rateLimit; // requests per second
    } else {
      minInterval = 60000 / sourceConfig.rateLimit; // requests per minute
    }
    
    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await utils.sleep(waitTime);
    }
    
    sourceConfig.lastRequest = Date.now();
  }

  /**
   * Get cached market data
   */
  async getCachedData(symbol, exchange) {
    try {
      const cacheKey = `market:${symbol}:${exchange}`;
      const cached = await cache.get(cacheKey);
      
      if (cached) {
        // Check if data is still fresh
        const dataAge = Date.now() - new Date(cached.lastUpdated).getTime();
        if (dataAge < this.cacheTimeout * 1000) {
          return cached;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error getting cached data:', error);
      return null;
    }
  }

  /**
   * Cache market data
   */
  async cacheMarketData(marketData) {
    try {
      const cacheKey = `market:${marketData.symbol}:${marketData.exchange}`;
      await cache.set(cacheKey, marketData, this.cacheTimeout);
    } catch (error) {
      logger.error('Error caching market data:', error);
    }
  }

  /**
   * Save market data to database
   */
  async saveMarketData(data) {
    try {
      const existingData = await MarketData.findOne({
        symbol: data.symbol,
        exchange: data.exchange
      });
      
      if (existingData) {
        // Update existing data
        Object.assign(existingData, data);
        await existingData.save();
      } else {
        // Create new data
        const marketData = new MarketData(data);
        await marketData.save();
      }
      
    } catch (error) {
      logger.error('Error saving market data:', error);
    }
  }

  /**
   * Fetch multiple symbols in batch
   */
  async fetchBatchMarketData(symbols, exchange = 'BINANCE') {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchPromises = batch.map(symbol => 
        this.fetchMarketData(symbol, exchange).catch(error => {
          logger.error(`Error fetching ${symbol}:`, error);
          return null;
        })
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults.map(result => 
        result.status === 'fulfilled' ? result.value : null
      ).filter(Boolean));
      
      // Small delay between batches
      if (i + batchSize < symbols.length) {
        await utils.sleep(100);
      }
    }
    
    return results;
  }

  /**
   * Get supported symbols for an exchange
   */
  async getSupportedSymbols(exchange = 'BINANCE') {
    try {
      switch (exchange.toUpperCase()) {
        case 'BINANCE':
          const response = await axios.get(`${this.dataSources.binance.baseUrl}/exchangeInfo`);
          return response.data.symbols
            .filter(symbol => symbol.status === 'TRADING')
            .map(symbol => symbol.symbol);
            
        case 'COINBASE':
          const cbResponse = await axios.get(`${this.dataSources.coinbase.baseUrl}/products`);
          return cbResponse.data
            .filter(product => product.status === 'online')
            .map(product => product.id);
            
        default:
          throw new Error(`Unsupported exchange: ${exchange}`);
      }
    } catch (error) {
      logger.error(`Error getting supported symbols for ${exchange}:`, error);
      return [];
    }
  }

  /**
   * Health check for data sources
   */
  async healthCheck() {
    const results = {};
    
    for (const [name, config] of Object.entries(this.dataSources)) {
      if (!config.enabled) {
        results[name] = { status: 'disabled' };
        continue;
      }
      
      try {
        const start = Date.now();
        
        switch (name) {
          case 'binance':
            await axios.get(`${config.baseUrl}/ping`, { timeout: 5000 });
            break;
          case 'coinbase':
            await axios.get(`${config.baseUrl}/time`, { timeout: 5000 });
            break;
          case 'coingecko':
            await axios.get(`${config.baseUrl}/ping`, { timeout: 5000 });
            break;
          default:
            continue;
        }
        
        const responseTime = Date.now() - start;
        results[name] = {
          status: 'healthy',
          responseTime,
          lastRequest: config.lastRequest
        };
        
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message,
          lastRequest: config.lastRequest
        };
      }
    }
    
    return results;
  }

  /**
   * Get data source statistics
   */
  getStats() {
    return {
      dataSources: Object.keys(this.dataSources).map(name => ({
        name,
        enabled: this.dataSources[name].enabled,
        rateLimit: this.dataSources[name].rateLimit,
        lastRequest: this.dataSources[name].lastRequest
      })),
      cacheTimeout: this.cacheTimeout,
      retryAttempts: this.retryAttempts
    };
  }
}

module.exports = DataSourceManager;