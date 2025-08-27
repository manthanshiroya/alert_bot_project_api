const express = require('express');
const { param, query, validationResult } = require('express-validator');
const { MarketData } = require('../models');
const { DataSourceManager, TechnicalAnalysis } = require('../services');
const { logger, helpers } = require('../utils');
const auth = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const dataSourceManager = new DataSourceManager();
const technicalAnalysis = new TechnicalAnalysis();

// Apply rate limiting
router.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: 'Too many market data requests from this IP, please try again later.'
}));

// Apply authentication to protected routes
const authMiddleware = auth;

/**
 * @route   GET /api/market/symbols
 * @desc    Get supported trading symbols
 * @access  Public
 */
router.get('/symbols', [
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange'),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Search term must be between 1 and 20 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { exchange = 'BINANCE', search, limit = 100 } = req.query;

    // Get supported symbols from exchange
    let symbols = await dataSourceManager.getSupportedSymbols(exchange);

    // Apply search filter
    if (search) {
      const searchTerm = search.toUpperCase();
      symbols = symbols.filter(symbol => 
        symbol.includes(searchTerm)
      );
    }

    // Apply limit
    symbols = symbols.slice(0, parseInt(limit));

    res.json(helpers.successResponse('Symbols retrieved successfully', {
      exchange,
      symbols,
      total: symbols.length
    }));

  } catch (error) {
    logger.error('Error getting symbols:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve symbols'));
  }
});

/**
 * @route   GET /api/market/price/:symbol
 * @desc    Get current price for a symbol
 * @access  Public
 */
router.get('/price/:symbol', [
  param('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be between 1 and 20 characters'),
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange'),
  query('refresh')
    .optional()
    .isBoolean()
    .withMessage('Refresh must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { symbol } = req.params;
    const { exchange = 'BINANCE', refresh = false } = req.query;

    const marketData = await dataSourceManager.fetchMarketData(
      symbol.toUpperCase(),
      exchange,
      refresh === 'true'
    );

    if (!marketData) {
      return res.status(404).json(helpers.errorResponse('Market data not found for symbol'));
    }

    res.json(helpers.successResponse('Price data retrieved successfully', {
      symbol: marketData.symbol,
      exchange: marketData.exchange,
      currentPrice: marketData.currentPrice,
      priceChange24h: marketData.marketStats?.priceChange24h,
      priceChangePercent24h: marketData.marketStats?.priceChangePercent24h,
      volume24h: marketData.marketStats?.volume24h,
      high24h: marketData.marketStats?.high24h,
      low24h: marketData.marketStats?.low24h,
      lastUpdated: marketData.lastUpdated
    }));

  } catch (error) {
    logger.error('Error getting price data:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve price data'));
  }
});

/**
 * @route   GET /api/market/data/:symbol
 * @desc    Get comprehensive market data for a symbol
 * @access  Public
 */
router.get('/data/:symbol', [
  param('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be between 1 and 20 characters'),
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange'),
  query('includeIndicators')
    .optional()
    .isBoolean()
    .withMessage('includeIndicators must be boolean'),
  query('refresh')
    .optional()
    .isBoolean()
    .withMessage('Refresh must be boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { symbol } = req.params;
    const { 
      exchange = 'BINANCE', 
      includeIndicators = false, 
      refresh = false 
    } = req.query;

    const marketData = await dataSourceManager.fetchMarketData(
      symbol.toUpperCase(),
      exchange,
      refresh === 'true'
    );

    if (!marketData) {
      return res.status(404).json(helpers.errorResponse('Market data not found for symbol'));
    }

    let responseData = {
      symbol: marketData.symbol,
      exchange: marketData.exchange,
      baseAsset: marketData.baseAsset,
      quoteAsset: marketData.quoteAsset,
      currentPrice: marketData.currentPrice,
      ohlcv: marketData.ohlcv,
      marketStats: marketData.marketStats,
      orderBook: marketData.orderBook,
      quality: marketData.quality,
      lastUpdated: marketData.lastUpdated
    };

    // Include technical indicators if requested
    if (includeIndicators === 'true') {
      try {
        const indicators = await technicalAnalysis.calculateIndicators(symbol.toUpperCase(), exchange);
        responseData.technicalIndicators = indicators;
      } catch (indicatorError) {
        logger.warn('Failed to calculate indicators:', indicatorError);
        responseData.technicalIndicators = null;
      }
    }

    res.json(helpers.successResponse('Market data retrieved successfully', responseData));

  } catch (error) {
    logger.error('Error getting market data:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve market data'));
  }
});

/**
 * @route   GET /api/market/indicators/:symbol
 * @desc    Get technical indicators for a symbol
 * @access  Private
 */
router.get('/indicators/:symbol', authMiddleware, [
  param('symbol')
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('Symbol must be between 1 and 20 characters'),
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange'),
  query('indicators')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        const indicators = value.split(',');
        const validIndicators = ['sma', 'ema', 'rsi', 'macd', 'bollinger', 'stochastic', 'williams', 'atr', 'adx', 'obv', 'vwap'];
        return indicators.every(indicator => validIndicators.includes(indicator.trim()));
      }
      return true;
    })
    .withMessage('Invalid indicators specified')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { symbol } = req.params;
    const { exchange = 'BINANCE', indicators } = req.query;

    // Parse requested indicators
    let requestedIndicators = null;
    if (indicators) {
      const indicatorList = indicators.split(',').map(i => i.trim());
      requestedIndicators = {};
      
      // Use default periods for requested indicators
      for (const indicator of indicatorList) {
        requestedIndicators[indicator] = technicalAnalysis.defaultPeriods[indicator];
      }
    }

    const indicatorData = await technicalAnalysis.calculateIndicators(
      symbol.toUpperCase(),
      exchange,
      requestedIndicators
    );

    res.json(helpers.successResponse('Technical indicators retrieved successfully', {
      symbol: symbol.toUpperCase(),
      exchange,
      indicators: indicatorData,
      calculatedAt: new Date()
    }));

  } catch (error) {
    logger.error('Error getting technical indicators:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve technical indicators'));
  }
});

/**
 * @route   GET /api/market/batch
 * @desc    Get market data for multiple symbols
 * @access  Private
 */
router.get('/batch', authMiddleware, [
  query('symbols')
    .notEmpty()
    .custom((value) => {
      const symbols = value.split(',');
      return symbols.length <= 20 && symbols.every(s => s.trim().length > 0);
    })
    .withMessage('Must provide 1-20 valid symbols separated by commas'),
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { symbols, exchange = 'BINANCE' } = req.query;
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

    const marketDataList = await dataSourceManager.fetchBatchMarketData(symbolList, exchange);

    const results = marketDataList.map(data => {
      if (!data) return null;
      
      return {
        symbol: data.symbol,
        exchange: data.exchange,
        currentPrice: data.currentPrice,
        priceChange24h: data.marketStats?.priceChange24h,
        priceChangePercent24h: data.marketStats?.priceChangePercent24h,
        volume24h: data.marketStats?.volume24h,
        lastUpdated: data.lastUpdated
      };
    }).filter(Boolean);

    res.json(helpers.successResponse('Batch market data retrieved successfully', {
      exchange,
      requestedSymbols: symbolList,
      results,
      successCount: results.length,
      totalRequested: symbolList.length
    }));

  } catch (error) {
    logger.error('Error getting batch market data:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve batch market data'));
  }
});

/**
 * @route   GET /api/market/trending
 * @desc    Get trending symbols
 * @access  Public
 */
router.get('/trending', [
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange'),
  query('sortBy')
    .optional()
    .isIn(['volume', 'priceChange', 'priceChangePercent'])
    .withMessage('Invalid sort criteria'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { 
      exchange = 'BINANCE', 
      sortBy = 'volume', 
      limit = 20 
    } = req.query;

    // Get trending symbols from database
    const sortField = `marketStats.${sortBy}24h`;
    const trendingData = await MarketData.find({ exchange })
      .sort({ [sortField]: -1 })
      .limit(parseInt(limit))
      .select('symbol currentPrice marketStats lastUpdated');

    const trending = trendingData.map(data => ({
      symbol: data.symbol,
      currentPrice: data.currentPrice,
      priceChange24h: data.marketStats?.priceChange24h,
      priceChangePercent24h: data.marketStats?.priceChangePercent24h,
      volume24h: data.marketStats?.volume24h,
      lastUpdated: data.lastUpdated
    }));

    res.json(helpers.successResponse('Trending symbols retrieved successfully', {
      exchange,
      sortBy,
      trending,
      count: trending.length
    }));

  } catch (error) {
    logger.error('Error getting trending symbols:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve trending symbols'));
  }
});

/**
 * @route   GET /api/market/gainers-losers
 * @desc    Get top gainers and losers
 * @access  Public
 */
router.get('/gainers-losers', [
  query('exchange')
    .optional()
    .isIn(['BINANCE', 'COINBASE', 'COINGECKO'])
    .withMessage('Invalid exchange'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(helpers.errorResponse('Validation failed', errors.array()));
    }

    const { exchange = 'BINANCE', limit = 10 } = req.query;

    // Get top gainers
    const gainers = await MarketData.find({ 
      exchange,
      'marketStats.priceChangePercent24h': { $gt: 0 }
    })
      .sort({ 'marketStats.priceChangePercent24h': -1 })
      .limit(parseInt(limit))
      .select('symbol currentPrice marketStats lastUpdated');

    // Get top losers
    const losers = await MarketData.find({ 
      exchange,
      'marketStats.priceChangePercent24h': { $lt: 0 }
    })
      .sort({ 'marketStats.priceChangePercent24h': 1 })
      .limit(parseInt(limit))
      .select('symbol currentPrice marketStats lastUpdated');

    const formatData = (data) => data.map(item => ({
      symbol: item.symbol,
      currentPrice: item.currentPrice,
      priceChange24h: item.marketStats?.priceChange24h,
      priceChangePercent24h: item.marketStats?.priceChangePercent24h,
      volume24h: item.marketStats?.volume24h,
      lastUpdated: item.lastUpdated
    }));

    res.json(helpers.successResponse('Gainers and losers retrieved successfully', {
      exchange,
      gainers: formatData(gainers),
      losers: formatData(losers)
    }));

  } catch (error) {
    logger.error('Error getting gainers and losers:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve gainers and losers'));
  }
});

/**
 * @route   GET /api/market/health
 * @desc    Get market data sources health status
 * @access  Private
 */
router.get('/health', authMiddleware, async (req, res) => {
  try {
    const healthStatus = await dataSourceManager.healthCheck();
    const technicalAnalysisHealth = await technicalAnalysis.healthCheck();

    res.json(helpers.successResponse('Market health status retrieved successfully', {
      dataSources: healthStatus,
      technicalAnalysis: technicalAnalysisHealth,
      timestamp: new Date()
    }));

  } catch (error) {
    logger.error('Error getting market health status:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve market health status'));
  }
});

/**
 * @route   GET /api/market/stats
 * @desc    Get market data statistics
 * @access  Private
 */
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const dataSourceStats = dataSourceManager.getStats();
    
    // Get database statistics
    const totalSymbols = await MarketData.countDocuments();
    const activeSymbols = await MarketData.countDocuments({
      lastUpdated: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    const exchangeStats = await MarketData.aggregate([
      {
        $group: {
          _id: '$exchange',
          count: { $sum: 1 },
          avgPrice: { $avg: '$currentPrice' },
          totalVolume: { $sum: '$marketStats.volume24h' }
        }
      }
    ]);

    res.json(helpers.successResponse('Market statistics retrieved successfully', {
      dataSources: dataSourceStats,
      database: {
        totalSymbols,
        activeSymbols,
        exchangeBreakdown: exchangeStats
      },
      timestamp: new Date()
    }));

  } catch (error) {
    logger.error('Error getting market statistics:', error);
    res.status(500).json(helpers.errorResponse('Failed to retrieve market statistics'));
  }
});

module.exports = router;