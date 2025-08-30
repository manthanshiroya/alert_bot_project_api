const moment = require('moment');

/**
 * Format alert message for Telegram
 * @param {Object} alert - Alert object from database
 * @returns {string} Formatted message
 */
function formatAlertMessage(alert) {
  const { alertData } = alert;
  const timestamp = moment(alertData.timestamp).format('YYYY-MM-DD HH:mm:ss UTC');
  
  let emoji = '📊';
  let signalText = alertData.signal;
  
  // Set emoji based on signal type
  switch (alertData.signal?.toLowerCase()) {
    case 'buy':
    case 'long':
      emoji = '🟢';
      signalText = '🔵 BUY SIGNAL';
      break;
    case 'sell':
    case 'short':
      emoji = '🔴';
      signalText = '🔴 SELL SIGNAL';
      break;
    case 'tp_hit':
    case 'take_profit':
      emoji = '💰';
      signalText = '💰 TAKE PROFIT HIT';
      break;
    case 'sl_hit':
    case 'stop_loss':
      emoji = '⛔';
      signalText = '⛔ STOP LOSS HIT';
      break;
    default:
      emoji = '📊';
      signalText = `📊 ${alertData.signal?.toUpperCase() || 'SIGNAL'}`;
  }

  let message = `${emoji} *${signalText}*\n\n`;
  
  // Basic alert information
  message += `📈 *Symbol:* ${alertData.symbol}\n`;
  message += `⏰ *Timeframe:* ${alertData.timeframe}\n`;
  message += `🎯 *Strategy:* ${alertData.strategy}\n`;
  
  if (alertData.price) {
    message += `💲 *Price:* $${parseFloat(alertData.price).toFixed(4)}\n`;
  }
  
  // Add TP/SL information if available
  if (alertData.takeProfitPrice) {
    message += `🎯 *Take Profit:* $${parseFloat(alertData.takeProfitPrice).toFixed(4)}\n`;
  }
  
  if (alertData.stopLossPrice) {
    message += `🛑 *Stop Loss:* $${parseFloat(alertData.stopLossPrice).toFixed(4)}\n`;
  }
  
  // Add trade number if available
  if (alertData.tradeNumber) {
    message += `🔢 *Trade #:* ${alertData.tradeNumber}\n`;
  }
  
  // Add original entry price for exit signals
  if (alertData.originalEntry && (alertData.signal === 'tp_hit' || alertData.signal === 'sl_hit')) {
    message += `📍 *Entry Price:* $${parseFloat(alertData.originalEntry).toFixed(4)}\n`;
    
    // Calculate P&L percentage
    const entryPrice = parseFloat(alertData.originalEntry);
    const exitPrice = parseFloat(alertData.price);
    const pnlPercent = ((exitPrice - entryPrice) / entryPrice * 100);
    const pnlEmoji = pnlPercent >= 0 ? '📈' : '📉';
    message += `${pnlEmoji} *P&L:* ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%\n`;
  }
  
  message += `\n🕐 *Time:* ${timestamp}`;
  
  // Add metadata if available
  if (alertData.metadata && Object.keys(alertData.metadata).length > 0) {
    message += `\n\n📋 *Additional Info:*\n`;
    Object.entries(alertData.metadata).forEach(([key, value]) => {
      message += `• *${key}:* ${value}\n`;
    });
  }
  
  return message;
}

/**
 * Format trade message for Telegram
 * @param {Object} trade - Trade object from database
 * @returns {string} Formatted message
 */
function formatTradeMessage(trade) {
  const { tradeData, status, pnl } = trade;
  const timestamp = moment(trade.createdAt).format('YYYY-MM-DD HH:mm:ss UTC');
  
  let emoji = '💼';
  let statusText = status;
  
  // Set emoji based on trade status
  switch (status?.toLowerCase()) {
    case 'open':
    case 'active':
      emoji = '🟢';
      statusText = '🟢 TRADE OPENED';
      break;
    case 'closed':
    case 'completed':
      emoji = pnl >= 0 ? '💰' : '📉';
      statusText = pnl >= 0 ? '💰 TRADE CLOSED (PROFIT)' : '📉 TRADE CLOSED (LOSS)';
      break;
    case 'cancelled':
      emoji = '❌';
      statusText = '❌ TRADE CANCELLED';
      break;
    default:
      emoji = '💼';
      statusText = `💼 ${status?.toUpperCase() || 'TRADE UPDATE'}`;
  }

  let message = `${emoji} *${statusText}*\n\n`;
  
  // Trade information
  message += `🔢 *Trade #:* ${trade.tradeNumber}\n`;
  message += `📈 *Symbol:* ${tradeData.symbol}\n`;
  message += `⏰ *Timeframe:* ${tradeData.timeframe}\n`;
  message += `🎯 *Strategy:* ${tradeData.strategy}\n`;
  message += `📊 *Signal:* ${tradeData.signal?.toUpperCase()}\n`;
  
  if (tradeData.entryPrice) {
    message += `📍 *Entry Price:* $${parseFloat(tradeData.entryPrice).toFixed(4)}\n`;
  }
  
  if (tradeData.exitPrice) {
    message += `🚪 *Exit Price:* $${parseFloat(tradeData.exitPrice).toFixed(4)}\n`;
  }
  
  if (tradeData.takeProfitPrice) {
    message += `🎯 *Take Profit:* $${parseFloat(tradeData.takeProfitPrice).toFixed(4)}\n`;
  }
  
  if (tradeData.stopLossPrice) {
    message += `🛑 *Stop Loss:* $${parseFloat(tradeData.stopLossPrice).toFixed(4)}\n`;
  }
  
  // P&L information
  if (pnl !== undefined && pnl !== null) {
    const pnlEmoji = pnl >= 0 ? '📈' : '📉';
    const pnlSign = pnl >= 0 ? '+' : '';
    message += `${pnlEmoji} *P&L:* ${pnlSign}$${pnl.toFixed(2)}\n`;
    
    // Calculate percentage if we have entry and exit prices
    if (tradeData.entryPrice && tradeData.exitPrice) {
      const entryPrice = parseFloat(tradeData.entryPrice);
      const exitPrice = parseFloat(tradeData.exitPrice);
      const pnlPercent = ((exitPrice - entryPrice) / entryPrice * 100);
      message += `📊 *P&L %:* ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%\n`;
    }
  }
  
  message += `\n🕐 *Time:* ${timestamp}`;
  
  return message;
}

/**
 * Format help message for Telegram
 * @returns {string} Formatted help message
 */
function formatHelpMessage() {
  return `🤖 *TradingView Alert Bot - Help*\n\n` +
    `*Available Commands:*\n\n` +
    `🚀 */start* - Start using the bot and get welcome message\n` +
    `❓ */help* - Show this help message\n` +
    `📊 */subscribe* - Subscribe to trading alerts\n` +
    `❌ */unsubscribe* - Unsubscribe from trading alerts\n` +
    `📋 */status* - Check your subscription status\n` +
    `📈 */alerts* - View recent alerts and trades\n` +
    `⚙️ */settings* - Configure notification preferences\n` +
    `📊 */stats* - View your trading statistics\n` +
    `🔗 */link* - Link your Telegram account to web account\n\n` +
    `*Features:*\n\n` +
    `🔔 Real-time trading alerts from TradingView\n` +
    `💼 Trade tracking and P&L monitoring\n` +
    `📊 Detailed trading statistics\n` +
    `⚙️ Customizable notification preferences\n` +
    `🔗 Web account integration\n\n` +
    `*Need Help?*\n` +
    `Contact support or visit our documentation for more information.`;
}

/**
 * Format user statistics message
 * @param {Object} user - TelegramUser object
 * @param {Array} recentTrades - Array of recent trades
 * @returns {string} Formatted statistics message
 */
function formatUserStatsMessage(user, recentTrades = []) {
  const joinDate = moment(user.stats.joinedAt).format('YYYY-MM-DD');
  const lastInteraction = moment(user.lastInteraction).format('YYYY-MM-DD HH:mm');
  
  let message = `📊 *Your Trading Statistics*\n\n`;
  
  // Basic stats
  message += `👤 *Name:* ${user.getFullName()}\n`;
  message += `📅 *Member Since:* ${joinDate}\n`;
  message += `🕐 *Last Active:* ${lastInteraction}\n\n`;
  
  // Trading stats
  message += `📈 *Trading Performance:*\n`;
  message += `🔔 Alerts Received: ${user.stats.alertsReceived}\n`;
  message += `💼 Trades Executed: ${user.stats.tradesExecuted}\n`;
  
  const totalPnL = user.stats.totalPnL || 0;
  const pnlEmoji = totalPnL >= 0 ? '📈' : '📉';
  const pnlSign = totalPnL >= 0 ? '+' : '';
  message += `${pnlEmoji} Total P&L: ${pnlSign}$${totalPnL.toFixed(2)}\n`;
  
  // Subscription info
  const activeSubscriptions = user.subscriptions.filter(sub => sub.isActive);
  message += `📊 Active Subscriptions: ${activeSubscriptions.length}\n`;
  message += `💬 Messages Sent: ${user.messageCount}\n\n`;
  
  // Recent trades summary
  if (recentTrades.length > 0) {
    message += `📋 *Recent Trades (Last 5):*\n`;
    recentTrades.slice(0, 5).forEach((trade, index) => {
      const tradeDate = moment(trade.createdAt).format('MM-DD');
      const pnl = trade.pnl || 0;
      const pnlEmoji = pnl >= 0 ? '📈' : '📉';
      const pnlSign = pnl >= 0 ? '+' : '';
      message += `${index + 1}. ${tradeDate} - ${trade.tradeData.symbol} ${pnlEmoji} ${pnlSign}$${pnl.toFixed(2)}\n`;
    });
  } else {
    message += `📋 *Recent Trades:* No trades yet\n`;
  }
  
  return message;
}

/**
 * Format subscription list message
 * @param {Object} user - TelegramUser object
 * @param {Array} alertConfigs - Array of available alert configurations
 * @returns {string} Formatted subscription message
 */
function formatSubscriptionMessage(user, alertConfigs = []) {
  let message = `📊 *Alert Subscriptions*\n\n`;
  
  if (alertConfigs.length === 0) {
    message += `No alert configurations available at the moment.\n\n`;
    message += `Contact support to set up trading alerts.`;
    return message;
  }
  
  message += `*Available Alert Configurations:*\n\n`;
  
  alertConfigs.forEach((config, index) => {
    const isSubscribed = user.isSubscribedTo(config._id);
    const statusEmoji = isSubscribed ? '✅' : '❌';
    
    message += `${index + 1}. ${statusEmoji} *${config.name}*\n`;
    message += `   📈 Strategy: ${config.strategy}\n`;
    message += `   📊 Symbols: ${config.symbols.join(', ')}\n`;
    message += `   ⏰ Timeframes: ${config.timeframes.join(', ')}\n\n`;
  });
  
  message += `Use the buttons below to subscribe or unsubscribe from alerts.`;
  
  return message;
}

/**
 * Format settings message
 * @param {Object} user - TelegramUser object
 * @returns {string} Formatted settings message
 */
function formatSettingsMessage(user) {
  const { preferences } = user;
  
  let message = `⚙️ *Notification Settings*\n\n`;
  
  // Alert preferences
  message += `🔔 *Alert Notifications:* ${preferences.receiveAlerts ? '✅ Enabled' : '❌ Disabled'}\n`;
  message += `💼 *Trade Updates:* ${preferences.receiveTradeUpdates ? '✅ Enabled' : '❌ Disabled'}\n`;
  message += `💰 *P&L Updates:* ${preferences.receivePnLUpdates ? '✅ Enabled' : '❌ Disabled'}\n\n`;
  
  // Format preferences
  message += `📋 *Alert Format:* ${preferences.alertFormat}\n`;
  message += `🌍 *Timezone:* ${preferences.timezone}\n\n`;
  
  message += `Use the buttons below to modify your settings.`;
  
  return message;
}

/**
 * Format error message
 * @param {string} errorType - Type of error
 * @param {string} details - Error details
 * @returns {string} Formatted error message
 */
function formatErrorMessage(errorType, details = '') {
  let message = `❌ *Error*\n\n`;
  
  switch (errorType) {
    case 'not_found':
      message += `The requested information was not found.`;
      break;
    case 'permission_denied':
      message += `You don't have permission to perform this action.`;
      break;
    case 'invalid_input':
      message += `Invalid input provided. Please check your command and try again.`;
      break;
    case 'server_error':
      message += `A server error occurred. Please try again later.`;
      break;
    default:
      message += `An unexpected error occurred.`;
  }
  
  if (details) {
    message += `\n\n*Details:* ${details}`;
  }
  
  message += `\n\nIf the problem persists, please contact support.`;
  
  return message;
}

/**
 * Format success message
 * @param {string} action - Action that was successful
 * @param {string} details - Success details
 * @returns {string} Formatted success message
 */
function formatSuccessMessage(action, details = '') {
  let message = `✅ *Success*\n\n`;
  
  switch (action) {
    case 'subscribed':
      message += `Successfully subscribed to alerts!`;
      break;
    case 'unsubscribed':
      message += `Successfully unsubscribed from alerts.`;
      break;
    case 'settings_updated':
      message += `Your settings have been updated.`;
      break;
    case 'account_linked':
      message += `Your Telegram account has been linked successfully.`;
      break;
    default:
      message += `Operation completed successfully.`;
  }
  
  if (details) {
    message += `\n\n${details}`;
  }
  
  return message;
}

module.exports = {
  formatAlertMessage,
  formatTradeMessage,
  formatHelpMessage,
  formatUserStatsMessage,
  formatSubscriptionMessage,
  formatSettingsMessage,
  formatErrorMessage,
  formatSuccessMessage
};