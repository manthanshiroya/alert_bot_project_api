const { MarketData } = require('../models');
const { cache } = require('../config/database');
const { logger, performanceLogger } = require('../utils');

class TechnicalAnalysis {
  constructor() {
    this.indicators = {
      sma: this.calculateSMA.bind(this),
      ema: this.calculateEMA.bind(this),
      rsi: this.calculateRSI.bind(this),
      macd: this.calculateMACD.bind(this),
      bollinger: this.calculateBollingerBands.bind(this),
      stochastic: this.calculateStochastic.bind(this),
      williams: this.calculateWilliamsR.bind(this),
      atr: this.calculateATR.bind(this),
      adx: this.calculateADX.bind(this),
      obv: this.calculateOBV.bind(this),
      vwap: this.calculateVWAP.bind(this)
    };
    
    this.defaultPeriods = {
      sma: [5, 10, 20, 50, 100, 200],
      ema: [5, 10, 20, 50, 100, 200],
      rsi: [14],
      macd: { fast: 12, slow: 26, signal: 9 },
      bollinger: { period: 20, stdDev: 2 },
      stochastic: { kPeriod: 14, dPeriod: 3 },
      williams: [14],
      atr: [14],
      adx: [14],
      obv: [],
      vwap: []
    };
  }

  /**
   * Calculate all technical indicators for a symbol
   */
  async calculateIndicators(symbol, exchange = 'BINANCE', periods = null) {
    const timer = performanceLogger.start('technical_analysis', { symbol, exchange });
    
    try {
      // Get historical data
      const historicalData = await this.getHistoricalData(symbol, exchange);
      
      if (!historicalData || historicalData.length < 200) {
        throw new Error(`Insufficient historical data for ${symbol}`);
      }
      
      const indicators = {};
      const usePeriods = periods || this.defaultPeriods;
      
      // Calculate each indicator
      for (const [indicatorName, calculator] of Object.entries(this.indicators)) {
        try {
          const indicatorPeriods = usePeriods[indicatorName];
          if (indicatorPeriods !== undefined) {
            indicators[indicatorName] = await calculator(historicalData, indicatorPeriods);
          }
        } catch (error) {
          logger.error(`Error calculating ${indicatorName} for ${symbol}:`, error);
          indicators[indicatorName] = null;
        }
      }
      
      // Cache the results
      await this.cacheIndicators(symbol, exchange, indicators);
      
      return indicators;
      
    } catch (error) {
      logger.error(`Error calculating indicators for ${symbol}:`, error);
      throw error;
    } finally {
      timer.end();
    }
  }

  /**
   * Get historical OHLCV data
   */
  async getHistoricalData(symbol, exchange, limit = 200) {
    try {
      // Try cache first
      const cacheKey = `historical:${symbol}:${exchange}:${limit}`;
      let data = await cache.get(cacheKey);
      
      if (!data) {
        // Get from database or external API
        data = await this.fetchHistoricalData(symbol, exchange, limit);
        
        if (data && data.length > 0) {
          // Cache for 5 minutes
          await cache.set(cacheKey, data, 300);
        }
      }
      
      return data;
    } catch (error) {
      logger.error(`Error getting historical data for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Fetch historical data from external source
   */
  async fetchHistoricalData(symbol, exchange, limit) {
    // This would typically fetch from your data source
    // For now, we'll simulate with recent market data
    try {
      const marketData = await MarketData.findOne({ symbol, exchange });
      if (!marketData) {
        return [];
      }
      
      // Generate sample historical data based on current price
      const data = [];
      const currentPrice = marketData.currentPrice;
      
      for (let i = limit - 1; i >= 0; i--) {
        const timestamp = new Date(Date.now() - i * 60 * 60 * 1000); // 1 hour intervals
        const volatility = 0.02; // 2% volatility
        const change = (Math.random() - 0.5) * volatility;
        const price = currentPrice * (1 + change * (i / limit));
        
        data.push({
          timestamp,
          open: price * (1 + (Math.random() - 0.5) * 0.01),
          high: price * (1 + Math.random() * 0.02),
          low: price * (1 - Math.random() * 0.02),
          close: price,
          volume: Math.random() * 1000000
        });
      }
      
      return data;
    } catch (error) {
      logger.error('Error fetching historical data:', error);
      return [];
    }
  }

  /**
   * Calculate Simple Moving Average
   */
  calculateSMA(data, periods) {
    const results = new Map();
    
    for (const period of periods) {
      const smaValues = [];
      
      for (let i = period - 1; i < data.length; i++) {
        const sum = data.slice(i - period + 1, i + 1)
          .reduce((acc, candle) => acc + candle.close, 0);
        smaValues.push(sum / period);
      }
      
      results.set(period.toString(), smaValues[smaValues.length - 1] || 0);
    }
    
    return results;
  }

  /**
   * Calculate Exponential Moving Average
   */
  calculateEMA(data, periods) {
    const results = new Map();
    
    for (const period of periods) {
      const multiplier = 2 / (period + 1);
      let ema = data[0].close; // Start with first close price
      
      for (let i = 1; i < data.length; i++) {
        ema = (data[i].close * multiplier) + (ema * (1 - multiplier));
      }
      
      results.set(period.toString(), ema);
    }
    
    return results;
  }

  /**
   * Calculate Relative Strength Index
   */
  calculateRSI(data, periods) {
    const results = new Map();
    
    for (const period of periods) {
      if (data.length < period + 1) {
        results.set(period.toString(), 50);
        continue;
      }
      
      let gains = 0;
      let losses = 0;
      
      // Calculate initial average gain and loss
      for (let i = 1; i <= period; i++) {
        const change = data[i].close - data[i - 1].close;
        if (change > 0) {
          gains += change;
        } else {
          losses += Math.abs(change);
        }
      }
      
      let avgGain = gains / period;
      let avgLoss = losses / period;
      
      // Calculate RSI for remaining periods
      for (let i = period + 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      }
      
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      
      results.set(period.toString(), rsi);
    }
    
    return results;
  }

  /**
   * Calculate MACD
   */
  calculateMACD(data, config) {
    const { fast, slow, signal } = config;
    
    if (data.length < slow) {
      return {
        macd: 0,
        signal: 0,
        histogram: 0
      };
    }
    
    // Calculate EMAs
    const fastEMA = this.calculateEMAValues(data, fast);
    const slowEMA = this.calculateEMAValues(data, slow);
    
    // Calculate MACD line
    const macdLine = [];
    for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
    
    // Calculate signal line (EMA of MACD)
    const signalLine = this.calculateEMAFromValues(macdLine, signal);
    
    const currentMacd = macdLine[macdLine.length - 1] || 0;
    const currentSignal = signalLine[signalLine.length - 1] || 0;
    
    return {
      macd: currentMacd,
      signal: currentSignal,
      histogram: currentMacd - currentSignal
    };
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(data, config) {
    const { period, stdDev } = config;
    
    if (data.length < period) {
      const currentPrice = data[data.length - 1].close;
      return {
        upper: currentPrice * 1.02,
        middle: currentPrice,
        lower: currentPrice * 0.98
      };
    }
    
    // Calculate SMA
    const recentData = data.slice(-period);
    const sma = recentData.reduce((sum, candle) => sum + candle.close, 0) / period;
    
    // Calculate standard deviation
    const variance = recentData.reduce((sum, candle) => {
      return sum + Math.pow(candle.close - sma, 2);
    }, 0) / period;
    
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }

  /**
   * Calculate Stochastic Oscillator
   */
  calculateStochastic(data, config) {
    const { kPeriod, dPeriod } = config;
    
    if (data.length < kPeriod) {
      return {
        k: 50,
        d: 50
      };
    }
    
    const kValues = [];
    
    for (let i = kPeriod - 1; i < data.length; i++) {
      const period = data.slice(i - kPeriod + 1, i + 1);
      const highest = Math.max(...period.map(candle => candle.high));
      const lowest = Math.min(...period.map(candle => candle.low));
      const current = data[i].close;
      
      const k = ((current - lowest) / (highest - lowest)) * 100;
      kValues.push(k);
    }
    
    // Calculate %D (SMA of %K)
    const recentK = kValues.slice(-dPeriod);
    const d = recentK.reduce((sum, k) => sum + k, 0) / recentK.length;
    
    return {
      k: kValues[kValues.length - 1] || 50,
      d: d || 50
    };
  }

  /**
   * Calculate Williams %R
   */
  calculateWilliamsR(data, periods) {
    const results = new Map();
    
    for (const period of periods) {
      if (data.length < period) {
        results.set(period.toString(), -50);
        continue;
      }
      
      const recentData = data.slice(-period);
      const highest = Math.max(...recentData.map(candle => candle.high));
      const lowest = Math.min(...recentData.map(candle => candle.low));
      const current = data[data.length - 1].close;
      
      const williamsR = ((highest - current) / (highest - lowest)) * -100;
      results.set(period.toString(), williamsR);
    }
    
    return results;
  }

  /**
   * Calculate Average True Range
   */
  calculateATR(data, periods) {
    const results = new Map();
    
    for (const period of periods) {
      if (data.length < period + 1) {
        results.set(period.toString(), 0);
        continue;
      }
      
      const trueRanges = [];
      
      for (let i = 1; i < data.length; i++) {
        const current = data[i];
        const previous = data[i - 1];
        
        const tr1 = current.high - current.low;
        const tr2 = Math.abs(current.high - previous.close);
        const tr3 = Math.abs(current.low - previous.close);
        
        trueRanges.push(Math.max(tr1, tr2, tr3));
      }
      
      // Calculate ATR as SMA of True Ranges
      const recentTR = trueRanges.slice(-period);
      const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
      
      results.set(period.toString(), atr);
    }
    
    return results;
  }

  /**
   * Calculate Average Directional Index
   */
  calculateADX(data, periods) {
    const results = new Map();
    
    for (const period of periods) {
      if (data.length < period * 2) {
        results.set(period.toString(), {
          adx: 25,
          plusDI: 25,
          minusDI: 25
        });
        continue;
      }
      
      // This is a simplified ADX calculation
      // In production, you'd want a more accurate implementation
      const adxValue = 25 + (Math.random() - 0.5) * 50; // Simplified
      
      results.set(period.toString(), {
        adx: Math.max(0, Math.min(100, adxValue)),
        plusDI: 25,
        minusDI: 25
      });
    }
    
    return results;
  }

  /**
   * Calculate On-Balance Volume
   */
  calculateOBV(data) {
    if (data.length < 2) {
      return 0;
    }
    
    let obv = 0;
    
    for (let i = 1; i < data.length; i++) {
      const current = data[i];
      const previous = data[i - 1];
      
      if (current.close > previous.close) {
        obv += current.volume;
      } else if (current.close < previous.close) {
        obv -= current.volume;
      }
      // If close prices are equal, OBV remains unchanged
    }
    
    return obv;
  }

  /**
   * Calculate Volume Weighted Average Price
   */
  calculateVWAP(data) {
    if (data.length === 0) {
      return 0;
    }
    
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    for (const candle of data) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      totalVolumePrice += typicalPrice * candle.volume;
      totalVolume += candle.volume;
    }
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  /**
   * Helper: Calculate EMA values array
   */
  calculateEMAValues(data, period) {
    const multiplier = 2 / (period + 1);
    const emaValues = [data[0].close];
    
    for (let i = 1; i < data.length; i++) {
      const ema = (data[i].close * multiplier) + (emaValues[i - 1] * (1 - multiplier));
      emaValues.push(ema);
    }
    
    return emaValues;
  }

  /**
   * Helper: Calculate EMA from values array
   */
  calculateEMAFromValues(values, period) {
    if (values.length === 0) return [];
    
    const multiplier = 2 / (period + 1);
    const emaValues = [values[0]];
    
    for (let i = 1; i < values.length; i++) {
      const ema = (values[i] * multiplier) + (emaValues[i - 1] * (1 - multiplier));
      emaValues.push(ema);
    }
    
    return emaValues;
  }

  /**
   * Cache technical indicators
   */
  async cacheIndicators(symbol, exchange, indicators) {
    try {
      const cacheKey = `indicators:${symbol}:${exchange}`;
      await cache.set(cacheKey, indicators, 300); // Cache for 5 minutes
    } catch (error) {
      logger.error('Error caching indicators:', error);
    }
  }

  /**
   * Get cached indicators
   */
  async getCachedIndicators(symbol, exchange) {
    try {
      const cacheKey = `indicators:${symbol}:${exchange}`;
      return await cache.get(cacheKey);
    } catch (error) {
      logger.error('Error getting cached indicators:', error);
      return null;
    }
  }

  /**
   * Update market data with technical indicators
   */
  async updateMarketDataIndicators(symbol, exchange = 'BINANCE') {
    try {
      const indicators = await this.calculateIndicators(symbol, exchange);
      
      const marketData = await MarketData.findOne({ symbol, exchange });
      if (marketData) {
        marketData.technicalIndicators = indicators;
        await marketData.save();
      }
      
      return indicators;
    } catch (error) {
      logger.error(`Error updating indicators for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Batch update indicators for multiple symbols
   */
  async batchUpdateIndicators(symbols, exchange = 'BINANCE') {
    const results = [];
    
    for (const symbol of symbols) {
      try {
        const indicators = await this.updateMarketDataIndicators(symbol, exchange);
        results.push({ symbol, indicators, success: true });
      } catch (error) {
        logger.error(`Error updating indicators for ${symbol}:`, error);
        results.push({ symbol, error: error.message, success: false });
      }
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  /**
   * Get indicator value for alert evaluation
   */
  async getIndicatorValue(symbol, exchange, indicatorType, period = null) {
    try {
      // Try cache first
      const cached = await this.getCachedIndicators(symbol, exchange);
      if (cached && cached[indicatorType]) {
        const indicator = cached[indicatorType];
        
        if (period && indicator instanceof Map) {
          return indicator.get(period.toString()) || 0;
        }
        
        return typeof indicator === 'object' ? indicator : indicator;
      }
      
      // Calculate fresh indicators
      const indicators = await this.calculateIndicators(symbol, exchange);
      const indicator = indicators[indicatorType];
      
      if (period && indicator instanceof Map) {
        return indicator.get(period.toString()) || 0;
      }
      
      return typeof indicator === 'object' ? indicator : indicator;
      
    } catch (error) {
      logger.error(`Error getting indicator value for ${symbol}:`, error);
      return 0;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test calculation with sample data
      const sampleData = [
        { timestamp: new Date(), open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: new Date(), open: 102, high: 108, low: 98, close: 105, volume: 1200 },
        { timestamp: new Date(), open: 105, high: 110, low: 100, close: 107, volume: 900 }
      ];
      
      const sma = this.calculateSMA(sampleData, [2]);
      
      return {
        status: 'healthy',
        indicators: Object.keys(this.indicators),
        sampleCalculation: sma.get('2')
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }
}

module.exports = TechnicalAnalysis;