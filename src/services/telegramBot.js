const TelegramBot = require('node-telegram-bot-api');
const TelegramUser = require('../models/TelegramUser');
const User = require('../models/User');
const Alert = require('../models/Alert');
const Trade = require('../models/Trade');
const logger = require('../utils/logger');
const { formatAlertMessage, formatTradeMessage, formatHelpMessage } = require('../utils/telegramFormatter');

class TelegramBotService {
  constructor() {
    this.bot = null;
    this.isInitialized = false;
    this.commands = new Map();
    this.setupCommands();
  }

  /**
   * Initialize the Telegram bot
   */
  async initialize() {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set in environment variables');
      }

      this.bot = new TelegramBot(token, { polling: true });
      
      // Set up bot commands
      await this.setupBotCommands();
      
      // Set up message handlers
      this.setupMessageHandlers();
      
      // Set up error handlers
      this.setupErrorHandlers();
      
      this.isInitialized = true;
      logger.info('Telegram bot initialized successfully');
      
      return true;
    } catch (error) {
      logger.error('Failed to initialize Telegram bot:', error);
      throw error;
    }
  }

  /**
   * Setup bot commands with descriptions
   */
  async setupBotCommands() {
    const commands = [
      { command: 'start', description: 'Start using the bot and get welcome message' },
      { command: 'help', description: 'Show available commands and help information' },
      { command: 'subscribe', description: 'Subscribe to trading alerts' },
      { command: 'unsubscribe', description: 'Unsubscribe from trading alerts' },
      { command: 'status', description: 'Check your subscription status' },
      { command: 'alerts', description: 'View recent alerts and trades' },
      { command: 'settings', description: 'Configure notification preferences' },
      { command: 'stats', description: 'View your trading statistics' },
      { command: 'link', description: 'Link your Telegram account to web account' }
    ];

    await this.bot.setMyCommands(commands);
    logger.info('Bot commands set successfully');
  }

  /**
   * Setup command handlers
   */
  setupCommands() {
    this.commands.set('/start', this.handleStartCommand.bind(this));
    this.commands.set('/help', this.handleHelpCommand.bind(this));
    this.commands.set('/subscribe', this.handleSubscribeCommand.bind(this));
    this.commands.set('/unsubscribe', this.handleUnsubscribeCommand.bind(this));
    this.commands.set('/status', this.handleStatusCommand.bind(this));
    this.commands.set('/alerts', this.handleAlertsCommand.bind(this));
    this.commands.set('/settings', this.handleSettingsCommand.bind(this));
    this.commands.set('/stats', this.handleStatsCommand.bind(this));
    this.commands.set('/link', this.handleLinkCommand.bind(this));
  }

  /**
   * Setup message handlers
   */
  setupMessageHandlers() {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        logger.error('Error handling message:', error);
        await this.sendErrorMessage(msg.chat.id, 'Sorry, something went wrong. Please try again.');
      }
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (callbackQuery) => {
      try {
        await this.handleCallbackQuery(callbackQuery);
      } catch (error) {
        logger.error('Error handling callback query:', error);
        await this.bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Sorry, something went wrong. Please try again.',
          show_alert: true
        });
      }
    });
  }

  /**
   * Setup error handlers
   */
  setupErrorHandlers() {
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram bot polling error:', error);
    });

    this.bot.on('error', (error) => {
      logger.error('Telegram bot error:', error);
    });
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = msg.from;

    // Log message for debugging
    logger.info(`Received message from ${user.id}: ${text}`);

    // Create or update telegram user
    await this.createOrUpdateTelegramUser(user);

    // Handle commands
    if (text && text.startsWith('/')) {
      const command = text.split(' ')[0];
      const handler = this.commands.get(command);
      
      if (handler) {
        await handler(msg);
      } else {
        await this.sendMessage(chatId, 'Unknown command. Type /help to see available commands.');
      }
    } else {
      // Handle non-command messages based on user session
      await this.handleNonCommandMessage(msg);
    }
  }

  /**
   * Handle callback queries from inline keyboards
   */
  async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;

    // Answer the callback query
    await this.bot.answerCallbackQuery(callbackQuery.id);

    // Handle main menu navigation
    if (data.startsWith('main_')) {
      await this.handleMainMenuCallback(chatId, messageId, data);
    }
    // Handle subscription callbacks
    else if (data.startsWith('subscribe_')) {
      const alertConfigId = data.replace('subscribe_', '');
      await this.handleSubscriptionCallback(chatId, alertConfigId, messageId);
    }
    // Handle unsubscription callbacks
    else if (data.startsWith('unsubscribe_')) {
      const alertConfigId = data.replace('unsubscribe_', '');
      await this.handleUnsubscriptionCallback(chatId, alertConfigId, messageId);
    }
    // Handle settings callbacks
    else if (data.startsWith('settings_')) {
      await this.handleSettingsCallback(chatId, messageId, data);
    }
    // Handle dashboard callbacks
    else if (data.startsWith('dashboard_')) {
      await this.handleDashboardCallback(chatId, messageId, data);
    }
    // Handle alerts callbacks
    else if (data.startsWith('alerts_')) {
      await this.handleAlertsCallback(chatId, messageId, data);
    }
    // Handle subscriptions callbacks
    else if (data.startsWith('subscriptions_')) {
      await this.handleSubscriptionsCallback(chatId, messageId, data);
    }
    // Handle stats callbacks
    else if (data.startsWith('stats_')) {
      await this.handleStatsCallback(chatId, messageId, data);
    }
    // Handle help callbacks
    else if (data.startsWith('help_')) {
      await this.handleHelpCallback(chatId, messageId, data);
    }
    // Handle trades callbacks
    else if (data.startsWith('trades_')) {
      await this.handleTradesCallback(chatId, messageId, data);
    }
    // Handle individual trade actions
    else if (data.startsWith('trade_')) {
      await this.handleTradeActionCallback(chatId, messageId, data);
    }
    // Handle onboarding callbacks
    else if (data.startsWith('onboard_')) {
      await this.handleOnboardingCallback(chatId, messageId, data);
    }
    // Show main menu
    else if (data === 'show_main_menu') {
      await this.showMainMenu(chatId, messageId);
    }
    // Handle other callbacks
    else {
      await this.handleGenericCallback(chatId, messageId, data);
    }
  }

  /**
   * Create or update Telegram user in database
   */
  async createOrUpdateTelegramUser(telegramUserData) {
    try {
      let telegramUser = await TelegramUser.findByTelegramId(telegramUserData.id);
      
      if (!telegramUser) {
        telegramUser = new TelegramUser({
          telegramId: telegramUserData.id.toString(),
          username: telegramUserData.username,
          firstName: telegramUserData.first_name,
          lastName: telegramUserData.last_name,
          languageCode: telegramUserData.language_code || 'en'
        });
        await telegramUser.save();
        logger.info(`New Telegram user created: ${telegramUser.telegramId}`);
      } else {
        // Update user information
        telegramUser.username = telegramUserData.username;
        telegramUser.firstName = telegramUserData.first_name;
        telegramUser.lastName = telegramUserData.last_name;
        telegramUser.languageCode = telegramUserData.language_code || 'en';
        await telegramUser.updateLastInteraction();
      }
      
      return telegramUser;
    } catch (error) {
      logger.error('Error creating/updating Telegram user:', error);
      throw error;
    }
  }

  /**
   * Handle /start command - Onboarding Flow or Main Menu
   */
  async handleStartCommand(msg) {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    // Check if user exists and has completed onboarding
    let telegramUser = await TelegramUser.findByTelegramId(user.id);
    
    if (!telegramUser) {
      // New user - start onboarding flow
      await this.startOnboardingFlow(chatId, user);
    } else if (!telegramUser.onboardingCompleted) {
      // Existing user who hasn't completed onboarding
      await this.continueOnboardingFlow(chatId, telegramUser);
    } else {
      // Returning user - show main menu
      await this.showMainMenu(chatId, user.first_name);
      await telegramUser.updateLastInteraction('/start');
    }
  }

  /**
   * Start onboarding flow for new users
   */
  async startOnboardingFlow(chatId, user) {
    try {
      // Create new user with onboarding step tracking
      const telegramUser = await this.createOrUpdateTelegramUser({
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username
      });
      
      // Set onboarding step
      telegramUser.onboardingStep = 1;
      telegramUser.onboardingCompleted = false;
      await telegramUser.save();
      
      const welcomeMessage = `🎉 *Welcome to TradingView Alert Bot, ${user.first_name}!*\n\n` +
        `I'm your personal trading assistant, here to help you:` +
        `\n\n🎯 *Get real-time trading signals*` +
        `\n💰 *Track your P&L automatically*` +
        `\n📊 *Analyze your trading performance*` +
        `\n⚙️ *Customize your experience*` +
        `\n\n✨ *Let's get you set up in just 3 easy steps!*` +
        `\n\n**Step 1 of 3: Choose Your Trading Style**`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '📈 Day Trader', callback_data: 'onboard_style_day' }],
          [{ text: '📊 Swing Trader', callback_data: 'onboard_style_swing' }],
          [{ text: '💼 Long-term Investor', callback_data: 'onboard_style_longterm' }],
          [{ text: '🎯 All Strategies', callback_data: 'onboard_style_all' }]
        ]
      };

      await this.sendMessage(chatId, welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Error starting onboarding flow:', error);
      await this.sendMessage(chatId, 'Welcome! There was an issue setting up your account. Please try again.');
    }
  }

  /**
   * Continue onboarding flow for existing users
   */
  async continueOnboardingFlow(chatId, telegramUser) {
    const step = telegramUser.onboardingStep || 1;
    
    switch (step) {
      case 1:
        await this.showOnboardingStep1(chatId, telegramUser.firstName);
        break;
      case 2:
        await this.showOnboardingStep2(chatId, telegramUser.firstName);
        break;
      case 3:
        await this.showOnboardingStep3(chatId, telegramUser.firstName);
        break;
      default:
        await this.completeOnboarding(chatId, telegramUser);
    }
  }

  /**
   * Show main menu for returning users
   */
  async showMainMenu(chatId, firstName) {
    const welcomeMessage = `🚀 *Welcome back, ${firstName}!*\n\n` +
      `🎯 *Your Trading Command Center*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📈 Real-time trading signals & alerts\n` +
      `💰 Advanced P&L tracking & analytics\n` +
      `⚙️ Personalized notification settings\n` +
      `📊 Comprehensive trading statistics\n` +
      `🔗 Seamless account integration\n\n` +
      `*Choose an option below:*`;

    const mainMenuKeyboard = {
      inline_keyboard: [
        [{ text: '📊 Dashboard', callback_data: 'main_dashboard' }, { text: '🔔 Alerts', callback_data: 'main_alerts' }],
        [{ text: '💼 Subscriptions', callback_data: 'main_subscriptions' }, { text: '📈 Statistics', callback_data: 'main_stats' }],
        [{ text: '⚙️ Settings', callback_data: 'main_settings' }, { text: '🔗 Link Account', callback_data: 'main_link' }],
        [{ text: '❓ Help & Support', callback_data: 'main_help' }]
      ]
    };

    await this.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard
    });
  }

  /**
   * Handle /help command
   */
  async handleHelpCommand(msg) {
    const chatId = msg.chat.id;
    const helpMessage = formatHelpMessage();
    await this.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle /subscribe command
   */
  async handleSubscribeCommand(msg) {
    const chatId = msg.chat.id;
    const telegramUser = await TelegramUser.findByTelegramId(msg.from.id);
    
    if (!telegramUser) {
      await this.sendMessage(chatId, 'Please start the bot first by typing /start');
      return;
    }

    // For now, we'll implement a simple subscription to all alerts
    // In a real implementation, you'd show available alert configurations
    const message = `📊 *Alert Subscription*

` +
      `Choose what type of alerts you want to receive:

` +
      `🔹 All Trading Signals - Get notified for all buy/sell signals
` +
      `🔹 Profit/Loss Updates - Get notified when TP/SL is hit
` +
      `🔹 Trade Summaries - Daily/weekly performance reports`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '✅ Subscribe to All', callback_data: 'subscribe_all' }],
        [{ text: '📈 Trading Signals Only', callback_data: 'subscribe_signals' }],
        [{ text: '💰 P&L Updates Only', callback_data: 'subscribe_pnl' }],
        [{ text: '❌ Cancel', callback_data: 'cancel' }]
      ]
    };

    await this.sendMessage(chatId, message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
  }

  /**
   * Handle /status command
   */
  async handleStatusCommand(msg) {
    const chatId = msg.chat.id;
    const telegramUser = await TelegramUser.findByTelegramId(msg.from.id);
    
    if (!telegramUser) {
      await this.sendMessage(chatId, 'Please start the bot first by typing /start');
      return;
    }

    const activeSubscriptions = telegramUser.subscriptions.filter(sub => sub.isActive);
    const statusMessage = `📊 *Your Status*

` +
      `👤 Name: ${telegramUser.getFullName()}
` +
      `🆔 Telegram ID: ${telegramUser.telegramId}
` +
      `📅 Joined: ${telegramUser.stats.joinedAt.toDateString()}
` +
      `📈 Active Subscriptions: ${activeSubscriptions.length}
` +
      `🔔 Alerts Received: ${telegramUser.stats.alertsReceived}
` +
      `💼 Trades Executed: ${telegramUser.stats.tradesExecuted}
` +
      `💰 Total P&L: $${telegramUser.stats.totalPnL.toFixed(2)}
` +
      `💬 Messages Sent: ${telegramUser.messageCount}`;

    await this.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' });
  }

  /**
   * Handle other commands (placeholder implementations)
   */
  async handleAlertsCommand(msg) {
    const chatId = msg.chat.id;
    await this.sendMessage(chatId, '📊 Recent alerts feature coming soon!');
  }

  async handleSettingsCommand(msg) {
    const chatId = msg.chat.id;
    await this.sendMessage(chatId, '⚙️ Settings feature coming soon!');
  }

  async handleStatsCommand(msg) {
    const chatId = msg.chat.id;
    await this.sendMessage(chatId, '📈 Statistics feature coming soon!');
  }

  async handleLinkCommand(msg) {
    const chatId = msg.chat.id;
    await this.sendMessage(chatId, '🔗 Account linking feature coming soon!');
  }

  async handleUnsubscribeCommand(msg) {
    const chatId = msg.chat.id;
    await this.sendMessage(chatId, '❌ Unsubscribe feature coming soon!');
  }

  /**
   * Handle non-command messages - Show main menu
   */
  async handleNonCommandMessage(msg) {
    const chatId = msg.chat.id;
    
    const menuMessage = `🤖 *Main Menu*

` +
      `I work best with buttons! Choose an option below:`;
    
    const quickMenuKeyboard = {
      inline_keyboard: [
        [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }],
        [{ text: '📊 Quick Dashboard', callback_data: 'main_dashboard' }, { text: '🔔 Recent Alerts', callback_data: 'main_alerts' }]
      ]
    };
    
    await this.sendMessage(chatId, menuMessage, {
      parse_mode: 'Markdown',
      reply_markup: quickMenuKeyboard
    });
  }

  /**
   * Handle subscription callback
   */
  async handleSubscriptionCallback(chatId, alertConfigId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      // For now, just mark as subscribed to all alerts
      telegramUser.preferences.receiveAlerts = true;
      telegramUser.preferences.receiveTradeUpdates = true;
      telegramUser.preferences.receivePnLUpdates = true;
      await telegramUser.save();

      await this.editMessage(chatId, messageId, 
        '✅ Successfully subscribed to trading alerts!\n\nYou will now receive notifications for new trading signals and updates.');
    } catch (error) {
      logger.error('Error handling subscription callback:', error);
      await this.sendMessage(chatId, 'Error processing subscription. Please try again.');
    }
  }

  /**
   * Handle unsubscription callback
   */
  async handleUnsubscriptionCallback(chatId, alertConfigId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      // Update user preferences
      telegramUser.preferences.receiveAlerts = false;
      telegramUser.preferences.receiveTradeUpdates = false;
      telegramUser.preferences.receivePnLUpdates = false;
      await telegramUser.save();

      const unsubscribeMessage = `❌ *Unsubscribed Successfully*\n\n` +
        `You will no longer receive trading alerts.\n\n` +
        `You can resubscribe anytime from the main menu.`;

      const backKeyboard = {
        inline_keyboard: [
          [{ text: '🔔 Resubscribe', callback_data: 'main_subscriptions' }],
          [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
        ]
      };

      await this.editMessage(chatId, messageId, unsubscribeMessage, {
        parse_mode: 'Markdown',
        reply_markup: backKeyboard
      });
    } catch (error) {
      logger.error('Error handling unsubscription callback:', error);
      await this.sendMessage(chatId, 'Error processing unsubscription. Please try again.');
    }
  }

  /**
   * Show main menu
   */
  async showMainMenu(chatId, messageId = null) {
    const menuMessage = `🏠 *Main Menu*\n\n` +
      `🎯 *Your Trading Command Center*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Choose an option below:`;

    const mainMenuKeyboard = {
      inline_keyboard: [
        [{ text: '📊 Dashboard', callback_data: 'main_dashboard' }, { text: '🔔 Alerts', callback_data: 'main_alerts' }],
        [{ text: '💼 Subscriptions', callback_data: 'main_subscriptions' }, { text: '📈 Statistics', callback_data: 'main_stats' }],
        [{ text: '⚙️ Settings', callback_data: 'main_settings' }, { text: '🔗 Link Account', callback_data: 'main_link' }],
        [{ text: '❓ Help & Support', callback_data: 'main_help' }]
      ]
    };

    if (messageId) {
      await this.editMessage(chatId, messageId, menuMessage, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard
      });
    } else {
      await this.sendMessage(chatId, menuMessage, {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard
      });
    }
  }

  /**
   * Handle main menu callbacks
   */
  async handleMainMenuCallback(chatId, messageId, callbackData) {
    const action = callbackData.replace('main_', '');
    
    switch (action) {
      case 'dashboard':
        await this.showDashboard(chatId, messageId);
        break;
      case 'alerts':
        await this.showAlertsMenu(chatId, messageId);
        break;
      case 'subscriptions':
        await this.showSubscriptionsMenu(chatId, messageId);
        break;
      case 'stats':
        await this.showStatsMenu(chatId, messageId);
        break;
      case 'settings':
        await this.showSettingsMenu(chatId, messageId);
        break;
      case 'link':
        await this.showLinkAccountMenu(chatId, messageId);
        break;
      case 'help':
        await this.showHelpMenu(chatId, messageId);
        break;
      default:
        await this.showMainMenu(chatId, messageId);
    }
  }

  /**
   * Show user dashboard with visual stats
   */
  async showDashboard(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const activeSubscriptions = telegramUser.subscriptions.filter(sub => sub.isActive);
      const pnlColor = telegramUser.stats.totalPnL >= 0 ? '🟢' : '🔴';
      const pnlSign = telegramUser.stats.totalPnL >= 0 ? '+' : '';
      
      // Create progress bars for stats
      const alertsProgress = this.createProgressBar(telegramUser.stats.alertsReceived, 100);
      const tradesProgress = this.createProgressBar(telegramUser.stats.tradesExecuted, 50);
      
      const dashboardMessage = `📊 *Your Trading Dashboard*\n\n` +
        `👤 *${telegramUser.getFullName()}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📈 *Trading Overview*\n` +
        `🔔 Alerts Received: *${telegramUser.stats.alertsReceived}*\n${alertsProgress}\n\n` +
        `💼 Trades Executed: *${telegramUser.stats.tradesExecuted}*\n${tradesProgress}\n\n` +
        `${pnlColor} Total P&L: *${pnlSign}$${telegramUser.stats.totalPnL.toFixed(2)}*\n\n` +
        `📊 *Account Status*\n` +
        `✅ Active Subscriptions: *${activeSubscriptions.length}*\n` +
        `💬 Messages Sent: *${telegramUser.messageCount}*\n` +
        `📅 Member Since: *${telegramUser.stats.joinedAt.toDateString()}*`;

      const dashboardKeyboard = {
        inline_keyboard: [
          [{ text: '🔄 Refresh', callback_data: 'main_dashboard' }, { text: '📈 Detailed Stats', callback_data: 'main_stats' }],
          [{ text: '🔔 Recent Alerts', callback_data: 'dashboard_recent_alerts' }, { text: '💼 Active Trades', callback_data: 'dashboard_active_trades' }],
          [{ text: '⚙️ Quick Settings', callback_data: 'main_settings' }],
          [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
        ]
      };

      await this.editMessage(chatId, messageId, dashboardMessage, {
        parse_mode: 'Markdown',
        reply_markup: dashboardKeyboard
      });
    } catch (error) {
      logger.error('Error showing dashboard:', error);
      await this.sendMessage(chatId, 'Error loading dashboard. Please try again.');
    }
  }

  /**
   * Create a visual progress bar
   */
  createProgressBar(current, max, length = 10) {
    const percentage = Math.min(current / max, 1);
    const filled = Math.round(percentage * length);
    const empty = length - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty) + ` ${current}/${max}`;
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(chatId, text, options = {}) {
    try {
      return await this.bot.sendMessage(chatId, text, options);
    } catch (error) {
      logger.error(`Error sending message to ${chatId}:`, error);
      throw error;
    }
  }

  /**
   * Show alerts menu with visual indicators
   */
  async showAlertsMenu(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const alertsMessage = `🔔 *Alert Management Center*\n\n` +
        `📊 *Alert Statistics*\n` +
        `🔔 Total Alerts Received: *${telegramUser.stats.alertsReceived}*\n` +
        `📈 Successful Trades: *${telegramUser.stats.tradesExecuted}*\n` +
        `📉 Success Rate: *${telegramUser.stats.alertsReceived > 0 ? ((telegramUser.stats.tradesExecuted / telegramUser.stats.alertsReceived) * 100).toFixed(1) : 0}%*\n\n` +
        `⚡ *Quick Actions*\n` +
        `Choose an option below to manage your alerts:`;

      const alertsKeyboard = {
        inline_keyboard: [
          [{ text: '📋 Recent Alerts', callback_data: 'alerts_recent' }, { text: '🔥 Hot Alerts', callback_data: 'alerts_hot' }],
          [{ text: '📈 Profitable Alerts', callback_data: 'alerts_profitable' }, { text: '📉 Loss Alerts', callback_data: 'alerts_loss' }],
          [{ text: '⚙️ Alert Settings', callback_data: 'alerts_settings' }, { text: '📊 Alert Analytics', callback_data: 'alerts_analytics' }],
          [{ text: '🔕 Pause Alerts', callback_data: 'alerts_pause' }, { text: '🔔 Resume Alerts', callback_data: 'alerts_resume' }],
          [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
        ]
      };

      await this.editMessage(chatId, messageId, alertsMessage, {
        parse_mode: 'Markdown',
        reply_markup: alertsKeyboard
      });
    } catch (error) {
      logger.error('Error showing alerts menu:', error);
      await this.sendMessage(chatId, 'Error loading alerts menu. Please try again.');
    }
  }

  /**
   * Show subscription management with visual status
   */
  async showSubscriptionsMenu(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const activeSubscriptions = telegramUser.subscriptions.filter(sub => sub.isActive);
      const inactiveSubscriptions = telegramUser.subscriptions.filter(sub => !sub.isActive);
      
      let subscriptionsList = '';
      if (activeSubscriptions.length > 0) {
        subscriptionsList += `✅ *Active Subscriptions (${activeSubscriptions.length}):*\n`;
        activeSubscriptions.forEach(sub => {
          subscriptionsList += `🟢 ${sub.alertType} - Since ${sub.subscribedAt.toDateString()}\n`;
        });
        subscriptionsList += '\n';
      }
      
      if (inactiveSubscriptions.length > 0) {
        subscriptionsList += `❌ *Inactive Subscriptions (${inactiveSubscriptions.length}):*\n`;
        inactiveSubscriptions.forEach(sub => {
          subscriptionsList += `🔴 ${sub.alertType}\n`;
        });
        subscriptionsList += '\n';
      }

      const subscriptionsMessage = `📋 *Subscription Management*\n\n` +
        subscriptionsList +
        `💡 *Manage your alert subscriptions below:*`;

      const subscriptionsKeyboard = {
        inline_keyboard: [
          [{ text: '➕ Add Subscription', callback_data: 'subscriptions_add' }, { text: '➖ Remove Subscription', callback_data: 'subscriptions_remove' }],
          [{ text: '🔄 Modify Existing', callback_data: 'subscriptions_modify' }, { text: '📊 Subscription Stats', callback_data: 'subscriptions_stats' }],
          [{ text: '⏸️ Pause All', callback_data: 'subscriptions_pause_all' }, { text: '▶️ Resume All', callback_data: 'subscriptions_resume_all' }],
          [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
        ]
      };

      await this.editMessage(chatId, messageId, subscriptionsMessage, {
        parse_mode: 'Markdown',
        reply_markup: subscriptionsKeyboard
      });
    } catch (error) {
      logger.error('Error showing subscriptions menu:', error);
      await this.sendMessage(chatId, 'Error loading subscriptions menu. Please try again.');
    }
  }

  /**
   * Show settings menu with interactive toggles
   */
  async showSettingsMenu(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const prefs = telegramUser.preferences;
      const alertsIcon = prefs.receiveAlerts ? '🔔' : '🔕';
      const tradesIcon = prefs.receiveTradeUpdates ? '📈' : '📉';
      const pnlIcon = prefs.receivePnLUpdates ? '💰' : '💸';
      const soundIcon = prefs.soundEnabled ? '🔊' : '🔇';
      const quietIcon = prefs.quietHours.enabled ? '🌙' : '☀️';

      const settingsMessage = `⚙️ *Settings & Preferences*\n\n` +
        `🎛️ *Notification Settings*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `${alertsIcon} Trading Alerts: *${prefs.receiveAlerts ? 'ON' : 'OFF'}*\n` +
        `${tradesIcon} Trade Updates: *${prefs.receiveTradeUpdates ? 'ON' : 'OFF'}*\n` +
        `${pnlIcon} P&L Updates: *${prefs.receivePnLUpdates ? 'ON' : 'OFF'}*\n` +
        `${soundIcon} Sound Notifications: *${prefs.soundEnabled ? 'ON' : 'OFF'}*\n` +
        `${quietIcon} Quiet Hours: *${prefs.quietHours.enabled ? 'ON' : 'OFF'}*\n\n` +
        `🌍 Language: *${prefs.language.toUpperCase()}*\n` +
        `🕐 Timezone: *${prefs.timezone}*\n\n` +
        `💡 *Tap any setting to toggle it on/off*`;

      const settingsKeyboard = {
        inline_keyboard: [
          [{ text: `${alertsIcon} Trading Alerts`, callback_data: 'settings_toggle_alerts' }, { text: `${tradesIcon} Trade Updates`, callback_data: 'settings_toggle_trades' }],
          [{ text: `${pnlIcon} P&L Updates`, callback_data: 'settings_toggle_pnl' }, { text: `${soundIcon} Sound`, callback_data: 'settings_toggle_sound' }],
          [{ text: `${quietIcon} Quiet Hours`, callback_data: 'settings_quiet_hours' }, { text: '🌍 Language', callback_data: 'settings_language' }],
          [{ text: '🕐 Timezone', callback_data: 'settings_timezone' }, { text: '🔄 Reset All', callback_data: 'settings_reset' }],
          [{ text: '💾 Export Settings', callback_data: 'settings_export' }, { text: '📥 Import Settings', callback_data: 'settings_import' }],
          [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
        ]
      };

      await this.editMessage(chatId, messageId, settingsMessage, {
        parse_mode: 'Markdown',
        reply_markup: settingsKeyboard
      });
    } catch (error) {
      logger.error('Error showing settings menu:', error);
      await this.sendMessage(chatId, 'Error loading settings menu. Please try again.');
    }
  }

  /**
   * Show statistics menu with detailed analytics
   */
  async showStatsMenu(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const stats = telegramUser.stats;
      const winRate = stats.alertsReceived > 0 ? ((stats.tradesExecuted / stats.alertsReceived) * 100).toFixed(1) : 0;
      const avgPnL = stats.tradesExecuted > 0 ? (stats.totalPnL / stats.tradesExecuted).toFixed(2) : 0;
      const pnlColor = stats.totalPnL >= 0 ? '🟢' : '🔴';
      const pnlSign = stats.totalPnL >= 0 ? '+' : '';
      
      // Create visual charts
      const alertsChart = this.createMiniChart([stats.alertsReceived, stats.tradesExecuted]);
      const pnlChart = this.createPnLChart(stats.totalPnL);
      
      const statsMessage = `📊 *Trading Statistics*\n\n` +
        `📈 *Performance Overview*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔔 Total Alerts: *${stats.alertsReceived}*\n` +
        `💼 Trades Executed: *${stats.tradesExecuted}*\n` +
        `🎯 Success Rate: *${winRate}%*\n` +
        `${pnlColor} Total P&L: *${pnlSign}$${stats.totalPnL.toFixed(2)}*\n` +
        `📊 Avg P&L per Trade: *$${avgPnL}*\n\n` +
        `📅 *Activity Stats*\n` +
        `🗓️ Member Since: *${stats.joinedAt.toDateString()}*\n` +
        `💬 Messages Sent: *${telegramUser.messageCount}*\n` +
        `🕐 Last Active: *${telegramUser.lastInteraction.toDateString()}*\n\n` +
        `📈 Alerts vs Trades: ${alertsChart}\n` +
        `💰 P&L Trend: ${pnlChart}`;

      const statsKeyboard = {
        inline_keyboard: [
          [{ text: '📊 Detailed Report', callback_data: 'stats_detailed' }, { text: '📈 Performance Chart', callback_data: 'stats_chart' }],
          [{ text: '📅 Weekly Stats', callback_data: 'stats_weekly' }, { text: '📆 Monthly Stats', callback_data: 'stats_monthly' }],
          [{ text: '🏆 Achievements', callback_data: 'stats_achievements' }, { text: '📋 Export Data', callback_data: 'stats_export' }],
          [{ text: '🔄 Refresh', callback_data: 'main_stats' }, { text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
        ]
      };

      await this.editMessage(chatId, messageId, statsMessage, {
        parse_mode: 'Markdown',
        reply_markup: statsKeyboard
      });
    } catch (error) {
      logger.error('Error showing stats menu:', error);
      await this.sendMessage(chatId, 'Error loading statistics menu. Please try again.');
    }
  }

  /**
   * Show help menu with comprehensive support options
   */
  async showHelpMenu(chatId, messageId) {
    const helpMessage = `❓ *Help & Support Center*\n\n` +
      `🎯 *Quick Start Guide*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `1️⃣ Subscribe to alerts using /subscribe\n` +
      `2️⃣ Configure your preferences in Settings\n` +
      `3️⃣ Monitor your dashboard for updates\n` +
      `4️⃣ Check statistics to track performance\n\n` +
      `🔧 *Available Commands*\n` +
      `• /start - Show main menu\n` +
      `• /help - Show this help\n` +
      `• /status - Check your status\n` +
      `• /subscribe - Subscribe to alerts\n` +
      `• /settings - Open settings\n\n` +
      `💡 *Tips & Tricks*\n` +
      `• Use the dashboard for quick overview\n` +
      `• Enable quiet hours for better sleep\n` +
      `• Check statistics regularly\n` +
      `• Link your web account for sync`;

    const helpKeyboard = {
      inline_keyboard: [
        [{ text: '📖 User Guide', callback_data: 'help_guide' }, { text: '🎥 Video Tutorials', callback_data: 'help_videos' }],
        [{ text: '❓ FAQ', callback_data: 'help_faq' }, { text: '🐛 Report Bug', callback_data: 'help_bug' }],
        [{ text: '💬 Contact Support', callback_data: 'help_contact' }, { text: '⭐ Rate Bot', callback_data: 'help_rate' }],
        [{ text: '📢 Updates & News', callback_data: 'help_news' }, { text: '🔗 Website', callback_data: 'help_website' }],
        [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
      ]
    };

    await this.editMessage(chatId, messageId, helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: helpKeyboard
    });
  }

  /**
   * Show account linking menu
   */
  async showLinkAccountMenu(chatId, messageId) {
    const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
    const isLinked = telegramUser && telegramUser.linkedUserId;
    
    const linkMessage = `🔗 *Account Linking*\n\n` +
      `${isLinked ? '✅' : '❌'} *Status:* ${isLinked ? 'Linked' : 'Not Linked'}\n\n` +
      `${isLinked ? 
        `🎉 Your Telegram account is linked to your web account!\n\n` +
        `📊 This enables:\n` +
        `• Synchronized settings\n` +
        `• Cross-platform notifications\n` +
        `• Unified trading history\n` +
        `• Enhanced security` :
        `🔐 Link your Telegram account to your web account for:\n\n` +
        `📱 Seamless experience across devices\n` +
        `🔄 Automatic settings sync\n` +
        `📊 Unified dashboard\n` +
        `🔒 Enhanced security features`
      }`;

    const linkKeyboard = {
      inline_keyboard: isLinked ? [
        [{ text: '🔄 Sync Now', callback_data: 'link_sync' }, { text: '⚙️ Link Settings', callback_data: 'link_settings' }],
        [{ text: '🔓 Unlink Account', callback_data: 'link_unlink' }],
        [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
      ] : [
        [{ text: '🔗 Link Account', callback_data: 'link_start' }, { text: '📱 QR Code', callback_data: 'link_qr' }],
        [{ text: '🔑 Enter Code', callback_data: 'link_code' }, { text: '❓ How to Link', callback_data: 'link_help' }],
        [{ text: '🏠 Main Menu', callback_data: 'show_main_menu' }]
      ]
    };

    await this.editMessage(chatId, messageId, linkMessage, {
      parse_mode: 'Markdown',
      reply_markup: linkKeyboard
    });
  }

  /**
    * Handle settings callbacks
    */
   async handleSettingsCallback(chatId, messageId, callbackData) {
     try {
       const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
       if (!telegramUser) {
         await this.sendMessage(chatId, 'Please start the bot first by typing /start');
         return;
       }
 
       const setting = callbackData.replace('settings_', '');
       
       switch (setting) {
         case 'toggle_alerts':
           telegramUser.preferences.receiveAlerts = !telegramUser.preferences.receiveAlerts;
           await telegramUser.save();
           await this.showSettingsMenu(chatId, messageId);
           break;
         case 'toggle_trades':
           telegramUser.preferences.receiveTradeUpdates = !telegramUser.preferences.receiveTradeUpdates;
           await telegramUser.save();
           await this.showSettingsMenu(chatId, messageId);
           break;
         case 'toggle_pnl':
           telegramUser.preferences.receivePnLUpdates = !telegramUser.preferences.receivePnLUpdates;
           await telegramUser.save();
           await this.showSettingsMenu(chatId, messageId);
           break;
         case 'toggle_sound':
           telegramUser.preferences.soundEnabled = !telegramUser.preferences.soundEnabled;
           await telegramUser.save();
           await this.showSettingsMenu(chatId, messageId);
           break;
         case 'quiet_hours':
           await this.showQuietHoursSettings(chatId, messageId);
           break;
         case 'language':
           await this.showLanguageSettings(chatId, messageId);
           break;
         case 'timezone':
           await this.showTimezoneSettings(chatId, messageId);
           break;
         case 'reset':
           await this.showResetConfirmation(chatId, messageId);
           break;
         default:
           await this.showSettingsMenu(chatId, messageId);
       }
     } catch (error) {
       logger.error('Error handling settings callback:', error);
       await this.sendMessage(chatId, 'Error updating settings. Please try again.');
     }
   }

  /**
    * Handle alerts callbacks
    */
   async handleAlertsCallback(chatId, messageId, callbackData) {
     try {
       const action = callbackData.replace('alerts_', '');
       
       switch (action) {
         case 'recent':
           await this.showRecentAlerts(chatId, messageId);
           break;
         case 'hot':
           await this.showHotAlerts(chatId, messageId);
           break;
         case 'profitable':
           await this.showProfitableAlerts(chatId, messageId);
           break;
         case 'loss':
           await this.showLossAlerts(chatId, messageId);
           break;
         case 'settings':
           await this.showAlertSettings(chatId, messageId);
           break;
         case 'analytics':
           await this.showAlertAnalytics(chatId, messageId);
           break;
         case 'pause':
           await this.pauseAlerts(chatId, messageId);
           break;
         case 'resume':
           await this.resumeAlerts(chatId, messageId);
           break;
         default:
           await this.showAlertsMenu(chatId, messageId);
       }
     } catch (error) {
       logger.error('Error handling alerts callback:', error);
       await this.sendMessage(chatId, 'Error processing alerts request. Please try again.');
     }
   }
 
   /**
    * Handle subscriptions callbacks
    */
   async handleSubscriptionsCallback(chatId, messageId, callbackData) {
     try {
       const action = callbackData.replace('subscriptions_', '');
       
       switch (action) {
         case 'add':
           await this.showAddSubscription(chatId, messageId);
           break;
         case 'remove':
           await this.showRemoveSubscription(chatId, messageId);
           break;
         case 'modify':
           await this.showModifySubscription(chatId, messageId);
           break;
         case 'stats':
           await this.showSubscriptionStats(chatId, messageId);
           break;
         case 'pause_all':
           await this.pauseAllSubscriptions(chatId, messageId);
           break;
         case 'resume_all':
           await this.resumeAllSubscriptions(chatId, messageId);
           break;
         default:
           await this.showSubscriptionsMenu(chatId, messageId);
       }
     } catch (error) {
       logger.error('Error handling subscriptions callback:', error);
       await this.sendMessage(chatId, 'Error processing subscription request. Please try again.');
     }
   }

  /**
   * Create mini chart visualization
   */
  createMiniChart(values) {
    const max = Math.max(...values);
    return values.map(v => {
      const height = Math.round((v / max) * 5);
      return ['▁', '▂', '▃', '▄', '▅', '▆'][height] || '▁';
    }).join('');
  }

  /**
   * Create P&L chart visualization
   */
  createPnLChart(pnl) {
    if (pnl > 0) return '📈 ' + '▲'.repeat(Math.min(Math.floor(pnl / 100), 5));
    if (pnl < 0) return '📉 ' + '▼'.repeat(Math.min(Math.floor(Math.abs(pnl) / 100), 5));
    return '➡️ ━';
  }

  /**
   * Edit a message
   */
  async editMessage(chatId, messageId, text, options = {}) {
    try {
      return await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        ...options
      });
    } catch (error) {
      // If message content is the same, just ignore the error
      if (error.message && error.message.includes('message is not modified')) {
        logger.info(`Message ${messageId} in chat ${chatId} not modified - content is the same`);
        return;
      }
      logger.error(`Error editing message ${messageId} in chat ${chatId}:`, error);
      throw error;
    }
  }

  /**
    * Placeholder methods for callback handlers
    */
   async handleDashboardCallback(chatId, messageId, data) {
     const action = data.replace('dashboard_', '');
     
     switch (action) {
       case 'trades':
         await this.showTradesManagement(chatId, messageId);
         break;
       case 'overview':
         await this.showDashboard(chatId, messageId);
         break;
       default:
         await this.showDashboard(chatId, messageId);
     }
   }
 
   async handleStatsCallback(chatId, messageId, data) {
     await this.sendMessage(chatId, 'Statistics feature coming soon!');
   }
 
   async handleHelpCallback(chatId, messageId, data) {
     await this.sendMessage(chatId, 'Help feature coming soon!');
   }
 
   async handleGenericCallback(chatId, messageId, data) {
     await this.sendMessage(chatId, 'Feature coming soon!');
   }

  // Placeholder methods for settings sub-menus
  async showQuietHoursSettings(chatId, messageId) {
    await this.sendMessage(chatId, 'Quiet hours settings coming soon!');
  }

  async showLanguageSettings(chatId, messageId) {
    await this.sendMessage(chatId, 'Language settings coming soon!');
  }

  async showTimezoneSettings(chatId, messageId) {
    await this.sendMessage(chatId, 'Timezone settings coming soon!');
  }

  async showResetConfirmation(chatId, messageId) {
    await this.sendMessage(chatId, 'Reset confirmation coming soon!');
  }

  // Placeholder methods for alerts sub-menus
  async showRecentAlerts(chatId, messageId) {
    await this.sendMessage(chatId, 'Recent alerts coming soon!');
  }

  async showHotAlerts(chatId, messageId) {
    await this.sendMessage(chatId, 'Hot alerts coming soon!');
  }

  async showProfitableAlerts(chatId, messageId) {
    await this.sendMessage(chatId, 'Profitable alerts coming soon!');
  }

  async showLossAlerts(chatId, messageId) {
    await this.sendMessage(chatId, 'Loss alerts coming soon!');
  }

  async showAlertSettings(chatId, messageId) {
    await this.sendMessage(chatId, 'Alert settings coming soon!');
  }

  async showAlertAnalytics(chatId, messageId) {
    await this.sendMessage(chatId, 'Alert analytics coming soon!');
  }

  async pauseAlerts(chatId, messageId) {
    await this.sendMessage(chatId, 'Pause alerts coming soon!');
  }

  async resumeAlerts(chatId, messageId) {
    await this.sendMessage(chatId, 'Resume alerts coming soon!');
  }

  // Placeholder methods for subscriptions sub-menus
  async showAddSubscription(chatId, messageId) {
    await this.sendMessage(chatId, 'Add subscription coming soon!');
  }

  async showRemoveSubscription(chatId, messageId) {
    await this.sendMessage(chatId, 'Remove subscription coming soon!');
  }

  async showModifySubscription(chatId, messageId) {
    await this.sendMessage(chatId, 'Modify subscription coming soon!');
  }

  async showSubscriptionStats(chatId, messageId) {
    await this.sendMessage(chatId, 'Subscription stats coming soon!');
  }

  async pauseAllSubscriptions(chatId, messageId) {
    await this.sendMessage(chatId, 'Pause all subscriptions coming soon!');
  }

  async resumeAllSubscriptions(chatId, messageId) {
    await this.sendMessage(chatId, 'Resume all subscriptions coming soon!');
  }

  /**
   * Show trades management interface
   */
  async showTradesManagement(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const Trade = require('../models/Trade');
      const openTrades = await Trade.find({ 
        userId: telegramUser._id, 
        status: 'open' 
      }).sort({ 'timestamps.openedAt': -1 }).limit(5);

      const closedTrades = await Trade.find({ 
        userId: telegramUser._id, 
        status: 'closed' 
      }).sort({ 'timestamps.closedAt': -1 }).limit(3);

      const totalPnL = await Trade.aggregate([
        { $match: { userId: telegramUser._id, status: 'closed' } },
        { $group: { _id: null, total: { $sum: '$pnl.amount' } } }
      ]);

      const pnlTotal = totalPnL.length > 0 ? totalPnL[0].total : 0;
      const pnlColor = pnlTotal >= 0 ? '🟢' : '🔴';
      const pnlSign = pnlTotal >= 0 ? '+' : '';

      const tradesMessage = `💼 *Trade Management Center*\n\n` +
        `📊 *Portfolio Overview*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔓 Open Trades: *${openTrades.length}*\n` +
        `📈 Closed Trades: *${closedTrades.length}*\n` +
        `${pnlColor} Total P&L: *${pnlSign}$${pnlTotal.toFixed(2)}*\n\n` +
        `*Quick Actions:*`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '🔓 Open Trades', callback_data: 'trades_open' }, { text: '📊 Trade History', callback_data: 'trades_history' }],
          [{ text: '📈 Performance', callback_data: 'trades_performance' }, { text: '⚡ Quick Close', callback_data: 'trades_quick_close' }],
          [{ text: '🎯 Set Alerts', callback_data: 'trades_set_alerts' }, { text: '📋 Export Data', callback_data: 'trades_export' }],
          [{ text: '🔙 Back to Dashboard', callback_data: 'main_dashboard' }]
        ]
      };

      if (messageId) {
        await this.editMessage(chatId, messageId, tradesMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else {
        await this.sendMessage(chatId, tradesMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }
    } catch (error) {
      logger.error('Error showing trades management:', error);
      await this.sendMessage(chatId, 'Error loading trades. Please try again.');
    }
  }

  /**
   * Show open trades with management options
   */
  async showOpenTrades(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const Trade = require('../models/Trade');
      const openTrades = await Trade.find({ 
        userId: telegramUser._id, 
        status: 'open' 
      }).sort({ 'timestamps.openedAt': -1 });

      if (openTrades.length === 0) {
        const noTradesMessage = `🔓 *Open Trades*\n\n` +
          `📭 No open trades found.\n\n` +
          `Start trading by subscribing to alerts and receiving signals!`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '📊 Subscribe to Alerts', callback_data: 'main_subscriptions' }],
            [{ text: '🔙 Back to Trades', callback_data: 'dashboard_trades' }]
          ]
        };

        await this.editMessage(chatId, messageId, noTradesMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }

      let tradesText = `🔓 *Open Trades (${openTrades.length})*\n\n`;
      const tradeButtons = [];

      openTrades.slice(0, 5).forEach((trade, index) => {
        const duration = Math.floor((Date.now() - trade.timestamps.openedAt) / (1000 * 60 * 60));
        const signal = trade.tradeData.signal === 'BUY' ? '🟢' : '🔴';
        const currentPnL = trade.pnl?.amount || 0;
        const pnlColor = currentPnL >= 0 ? '🟢' : '🔴';
        const pnlSign = currentPnL >= 0 ? '+' : '';

        tradesText += `${signal} *${trade.tradeData.symbol}* #${trade.tradeNumber}\n` +
          `💰 Entry: $${trade.tradeData.entryPrice}\n` +
          `${pnlColor} P&L: ${pnlSign}$${currentPnL.toFixed(2)}\n` +
          `⏱️ Duration: ${duration}h\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        tradeButtons.push([
          { text: `📊 Trade #${trade.tradeNumber}`, callback_data: `trade_view_${trade._id}` },
          { text: '❌ Close', callback_data: `trade_close_${trade._id}` }
        ]);
      });

      tradeButtons.push([{ text: '🔙 Back to Trades', callback_data: 'dashboard_trades' }]);

      const keyboard = { inline_keyboard: tradeButtons };

      await this.editMessage(chatId, messageId, tradesText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Error showing open trades:', error);
      await this.sendMessage(chatId, 'Error loading open trades. Please try again.');
    }
  }

  /**
   * Handle trades callbacks
   */
  async handleTradesCallback(chatId, messageId, data) {
    try {
      const action = data.replace('trades_', '');
      
      switch (action) {
        case 'open':
          await this.showOpenTrades(chatId, messageId);
          break;
        case 'history':
          await this.showTradeHistory(chatId, messageId);
          break;
        case 'performance':
          await this.showTradePerformance(chatId, messageId);
          break;
        case 'quick_close':
          await this.showQuickCloseOptions(chatId, messageId);
          break;
        case 'set_alerts':
          await this.showTradeAlerts(chatId, messageId);
          break;
        case 'export':
          await this.exportTradeData(chatId, messageId);
          break;
        default:
          await this.showTradesManagement(chatId, messageId);
      }
    } catch (error) {
      logger.error('Error handling trades callback:', error);
      await this.sendMessage(chatId, 'Error processing trades request. Please try again.');
    }
  }

  /**
   * Handle individual trade action callbacks
   */
  async handleTradeActionCallback(chatId, messageId, data) {
    try {
      const parts = data.split('_');
      const action = parts[1]; // view, close, modify, etc.
      const tradeId = parts[2];
      
      switch (action) {
        case 'view':
          await this.showTradeDetails(chatId, messageId, tradeId);
          break;
        case 'close':
          await this.showCloseTradeConfirmation(chatId, messageId, tradeId);
          break;
        case 'modify':
          await this.showModifyTradeOptions(chatId, messageId, tradeId);
          break;
        case 'confirm':
          if (parts[2] === 'close') {
            await this.confirmCloseTrade(chatId, messageId, parts[3]);
          }
          break;
        default:
          await this.showTradeDetails(chatId, messageId, tradeId);
      }
    } catch (error) {
      logger.error('Error handling trade action callback:', error);
      await this.sendMessage(chatId, 'Error processing trade action. Please try again.');
    }
  }

  /**
   * Show trade history
   */
  async showTradeHistory(chatId, messageId) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const Trade = require('../models/Trade');
      const closedTrades = await Trade.find({ 
        userId: telegramUser._id, 
        status: 'closed' 
      }).sort({ 'timestamps.closedAt': -1 }).limit(10);

      if (closedTrades.length === 0) {
        const noHistoryMessage = `📊 *Trade History*\n\n` +
          `📭 No closed trades found.\n\n` +
          `Your completed trades will appear here once you close positions.`;

        const keyboard = {
          inline_keyboard: [
            [{ text: '🔓 View Open Trades', callback_data: 'trades_open' }],
            [{ text: '🔙 Back to Trades', callback_data: 'dashboard_trades' }]
          ]
        };

        await this.editMessage(chatId, messageId, noHistoryMessage, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        return;
      }

      let historyText = `📊 *Trade History (${closedTrades.length})*\n\n`;
      let totalPnL = 0;
      let winCount = 0;

      closedTrades.forEach((trade, index) => {
        const signal = trade.tradeData.signal === 'BUY' ? '🟢' : '🔴';
        const pnl = trade.pnl?.amount || 0;
        const pnlColor = pnl >= 0 ? '🟢' : '🔴';
        const pnlSign = pnl >= 0 ? '+' : '';
        const exitReason = trade.tradeData.exitReason || 'MANUAL';
        const exitIcon = exitReason === 'TP_HIT' ? '🎯' : exitReason === 'SL_HIT' ? '🛑' : '✋';
        
        totalPnL += pnl;
        if (pnl > 0) winCount++;

        const closedDate = new Date(trade.timestamps.closedAt).toLocaleDateString();
        
        historyText += `${signal} *${trade.tradeData.symbol}* #${trade.tradeNumber}\n` +
          `💰 Entry: $${trade.tradeData.entryPrice} → Exit: $${trade.tradeData.exitPrice}\n` +
          `${pnlColor} P&L: ${pnlSign}$${pnl.toFixed(2)} (${(trade.pnl?.percentage || 0).toFixed(1)}%)\n` +
          `${exitIcon} ${exitReason} • ${closedDate}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      });

      const winRate = closedTrades.length > 0 ? ((winCount / closedTrades.length) * 100).toFixed(1) : 0;
      const totalColor = totalPnL >= 0 ? '🟢' : '🔴';
      const totalSign = totalPnL >= 0 ? '+' : '';

      historyText += `📈 *Summary*\n` +
        `${totalColor} Total P&L: ${totalSign}$${totalPnL.toFixed(2)}\n` +
        `🎯 Win Rate: ${winRate}% (${winCount}/${closedTrades.length})`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '📈 Performance Analysis', callback_data: 'trades_performance' }],
          [{ text: '🔓 Open Trades', callback_data: 'trades_open' }, { text: '📋 Export', callback_data: 'trades_export' }],
          [{ text: '🔙 Back to Trades', callback_data: 'dashboard_trades' }]
        ]
      };

      await this.editMessage(chatId, messageId, historyText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Error showing trade history:', error);
      await this.sendMessage(chatId, 'Error loading trade history. Please try again.');
    }
  }

  /**
   * Show individual trade details
   */
  async showTradeDetails(chatId, messageId, tradeId) {
    try {
      const Trade = require('../models/Trade');
      const trade = await Trade.findById(tradeId);
      
      if (!trade) {
        await this.sendMessage(chatId, 'Trade not found.');
        return;
      }

      const signal = trade.tradeData.signal === 'BUY' ? '🟢 LONG' : '🔴 SHORT';
      const status = trade.status === 'open' ? '🔓 OPEN' : '🔒 CLOSED';
      const pnl = trade.pnl?.amount || 0;
      const pnlColor = pnl >= 0 ? '🟢' : '🔴';
      const pnlSign = pnl >= 0 ? '+' : '';
      
      const openedDate = new Date(trade.timestamps.openedAt).toLocaleString();
      const closedDate = trade.timestamps.closedAt ? new Date(trade.timestamps.closedAt).toLocaleString() : 'Still Open';
      
      const duration = trade.timestamps.closedAt 
        ? Math.floor((trade.timestamps.closedAt - trade.timestamps.openedAt) / (1000 * 60 * 60))
        : Math.floor((Date.now() - trade.timestamps.openedAt) / (1000 * 60 * 60));

      const detailsText = `📊 *Trade Details #${trade.tradeNumber}*\n\n` +
        `${signal} *${trade.tradeData.symbol}*\n` +
        `${status} • ⏱️ ${duration}h\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💰 *Entry Price:* $${trade.tradeData.entryPrice}\n` +
        (trade.tradeData.exitPrice ? `💰 *Exit Price:* $${trade.tradeData.exitPrice}\n` : '') +
        (trade.tradeData.takeProfitPrice ? `🎯 *Take Profit:* $${trade.tradeData.takeProfitPrice}\n` : '') +
        (trade.tradeData.stopLossPrice ? `🛑 *Stop Loss:* $${trade.tradeData.stopLossPrice}\n` : '') +
        `\n${pnlColor} *P&L:* ${pnlSign}$${pnl.toFixed(2)}` +
        (trade.pnl?.percentage ? ` (${pnlSign}${trade.pnl.percentage.toFixed(2)}%)` : '') +
        `\n\n📅 *Opened:* ${openedDate}\n` +
        `📅 *Closed:* ${closedDate}\n\n` +
        `📈 *Strategy:* ${trade.tradeData.strategy}\n` +
        `⏰ *Timeframe:* ${trade.tradeData.timeframe}`;

      const keyboard = {
        inline_keyboard: trade.status === 'open' ? [
          [{ text: '❌ Close Trade', callback_data: `trade_close_${trade._id}` }, { text: '✏️ Modify', callback_data: `trade_modify_${trade._id}` }],
          [{ text: '🔙 Back to Open Trades', callback_data: 'trades_open' }]
        ] : [
          [{ text: '🔙 Back to History', callback_data: 'trades_history' }]
        ]
      };

      await this.editMessage(chatId, messageId, detailsText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Error showing trade details:', error);
      await this.sendMessage(chatId, 'Error loading trade details. Please try again.');
    }
  }

  /**
   * Show close trade confirmation
   */
  async showCloseTradeConfirmation(chatId, messageId, tradeId) {
    try {
      const Trade = require('../models/Trade');
      const trade = await Trade.findById(tradeId);
      
      if (!trade || trade.status !== 'open') {
        await this.sendMessage(chatId, 'Trade not found or already closed.');
        return;
      }

      const signal = trade.tradeData.signal === 'BUY' ? '🟢' : '🔴';
      const currentPnL = trade.pnl?.amount || 0;
      const pnlColor = currentPnL >= 0 ? '🟢' : '🔴';
      const pnlSign = currentPnL >= 0 ? '+' : '';

      const confirmText = `❌ *Close Trade Confirmation*\n\n` +
        `${signal} *${trade.tradeData.symbol}* #${trade.tradeNumber}\n` +
        `💰 Entry: $${trade.tradeData.entryPrice}\n` +
        `${pnlColor} Current P&L: ${pnlSign}$${currentPnL.toFixed(2)}\n\n` +
        `⚠️ Are you sure you want to close this trade?\n` +
        `This action cannot be undone.`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ Confirm Close', callback_data: `trade_confirm_close_${trade._id}` }],
          [{ text: '❌ Cancel', callback_data: `trade_view_${trade._id}` }]
        ]
      };

      await this.editMessage(chatId, messageId, confirmText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      logger.error('Error showing close confirmation:', error);
      await this.sendMessage(chatId, 'Error processing close request. Please try again.');
    }
  }

  /**
   * Confirm and execute trade closure
   */
  async confirmCloseTrade(chatId, messageId, tradeId) {
    try {
      const Trade = require('../models/Trade');
      const trade = await Trade.findById(tradeId);
      
      if (!trade || trade.status !== 'open') {
        await this.sendMessage(chatId, 'Trade not found or already closed.');
        return;
      }

      // For demo purposes, we'll use the entry price as exit price
      // In a real implementation, you'd get the current market price
      const exitPrice = trade.tradeData.entryPrice; // This should be current market price
      
      await trade.closeTrade(exitPrice, 'MANUAL');
      
      const signal = trade.tradeData.signal === 'BUY' ? '🟢' : '🔴';
      const pnl = trade.pnl?.amount || 0;
      const pnlColor = pnl >= 0 ? '🟢' : '🔴';
      const pnlSign = pnl >= 0 ? '+' : '';

      const successText = `✅ *Trade Closed Successfully*\n\n` +
        `${signal} *${trade.tradeData.symbol}* #${trade.tradeNumber}\n` +
        `💰 Entry: $${trade.tradeData.entryPrice}\n` +
        `💰 Exit: $${trade.tradeData.exitPrice}\n` +
        `${pnlColor} Final P&L: ${pnlSign}$${pnl.toFixed(2)}\n\n` +
        `🎉 Trade has been closed and added to your history.`;

      const keyboard = {
        inline_keyboard: [
          [{ text: '📊 View History', callback_data: 'trades_history' }],
          [{ text: '🔓 Open Trades', callback_data: 'trades_open' }],
          [{ text: '🔙 Back to Trades', callback_data: 'dashboard_trades' }]
        ]
      };

      await this.editMessage(chatId, messageId, successText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

      // Update user stats
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (telegramUser) {
        telegramUser.stats.tradesExecuted += 1;
        telegramUser.stats.totalPnL += pnl;
        await telegramUser.save();
      }
    } catch (error) {
      logger.error('Error confirming trade close:', error);
      await this.sendMessage(chatId, 'Error closing trade. Please try again.');
    }
  }

  // Placeholder methods for additional trade features
  async showTradePerformance(chatId, messageId) {
    await this.sendMessage(chatId, '📈 Trade performance analysis coming soon!');
  }

  async showQuickCloseOptions(chatId, messageId) {
    await this.sendMessage(chatId, '⚡ Quick close options coming soon!');
  }

  async showTradeAlerts(chatId, messageId) {
    await this.sendMessage(chatId, '🎯 Trade alerts setup coming soon!');
  }

  async exportTradeData(chatId, messageId) {
    await this.sendMessage(chatId, '📋 Trade data export coming soon!');
  }

  async showModifyTradeOptions(chatId, messageId, tradeId) {
    await this.sendMessage(chatId, '✏️ Trade modification options coming soon!');
  }

  /**
   * Handle onboarding callbacks
   */
  async handleOnboardingCallback(chatId, messageId, data) {
    try {
      const telegramUser = await TelegramUser.findOne({ telegramId: chatId.toString() });
      if (!telegramUser) {
        await this.sendMessage(chatId, 'Please start the bot first by typing /start');
        return;
      }

      const action = data.replace('onboard_', '');
      
      if (action.startsWith('style_')) {
        const style = action.replace('style_', '');
        await this.handleTradingStyleSelection(chatId, messageId, telegramUser, style);
      } else if (action.startsWith('alerts_')) {
        const alertType = action.replace('alerts_', '');
        await this.handleAlertPreferences(chatId, messageId, telegramUser, alertType);
      } else if (action.startsWith('notifications_')) {
        const notifType = action.replace('notifications_', '');
        await this.handleNotificationPreferences(chatId, messageId, telegramUser, notifType);
      } else if (action === 'complete') {
        await this.completeOnboarding(chatId, messageId, telegramUser);
      } else if (action === 'skip') {
        await this.skipOnboardingStep(chatId, messageId, telegramUser);
      }
    } catch (error) {
      logger.error('Error handling onboarding callback:', error);
      await this.sendMessage(chatId, 'Error processing your selection. Please try again.');
    }
  }

  /**
   * Handle trading style selection (Step 1)
   */
  async handleTradingStyleSelection(chatId, messageId, telegramUser, style) {
    // Save trading style preference
    telegramUser.preferences.tradingStyle = style;
    telegramUser.onboardingStep = 2;
    await telegramUser.save();

    const styleNames = {
      day: 'Day Trading',
      swing: 'Swing Trading', 
      longterm: 'Long-term Investing',
      all: 'All Strategies'
    };

    const step2Message = `✅ Great choice! You've selected **${styleNames[style]}**\n\n` +
      `📊 **Step 2 of 3: Alert Preferences**\n\n` +
      `What types of alerts would you like to receive?`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔔 All Alerts', callback_data: 'onboard_alerts_all' }],
        [{ text: '📈 Entry Signals Only', callback_data: 'onboard_alerts_entry' }],
        [{ text: '💰 P&L Updates Only', callback_data: 'onboard_alerts_pnl' }],
        [{ text: '🎯 Custom Selection', callback_data: 'onboard_alerts_custom' }],
        [{ text: '⏭️ Skip for Now', callback_data: 'onboard_skip' }]
      ]
    };

    await this.editMessage(chatId, messageId, step2Message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Handle alert preferences (Step 2)
   */
  async handleAlertPreferences(chatId, messageId, telegramUser, alertType) {
    // Save alert preferences
    switch (alertType) {
      case 'all':
        telegramUser.preferences.receiveAlerts = true;
        telegramUser.preferences.receiveTradeUpdates = true;
        telegramUser.preferences.receivePnLUpdates = true;
        break;
      case 'entry':
        telegramUser.preferences.receiveAlerts = true;
        telegramUser.preferences.receiveTradeUpdates = false;
        telegramUser.preferences.receivePnLUpdates = false;
        break;
      case 'pnl':
        telegramUser.preferences.receiveAlerts = false;
        telegramUser.preferences.receiveTradeUpdates = false;
        telegramUser.preferences.receivePnLUpdates = true;
        break;
      case 'custom':
        // For now, default to all alerts - could expand this later
        telegramUser.preferences.receiveAlerts = true;
        telegramUser.preferences.receiveTradeUpdates = true;
        telegramUser.preferences.receivePnLUpdates = true;
        break;
    }

    telegramUser.onboardingStep = 3;
    await telegramUser.save();

    const step3Message = `✅ Alert preferences saved!\n\n` +
      `🔔 **Step 3 of 3: Notification Settings**\n\n` +
      `When would you like to receive notifications?`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🌅 Market Hours Only', callback_data: 'onboard_notifications_market' }],
        [{ text: '🌍 24/7 Notifications', callback_data: 'onboard_notifications_always' }],
        [{ text: '🌙 Quiet Hours (9PM-7AM)', callback_data: 'onboard_notifications_quiet' }],
        [{ text: '⚙️ Custom Schedule', callback_data: 'onboard_notifications_custom' }],
        [{ text: '⏭️ Skip for Now', callback_data: 'onboard_skip' }]
      ]
    };

    await this.editMessage(chatId, messageId, step3Message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Handle notification preferences (Step 3)
   */
  async handleNotificationPreferences(chatId, messageId, telegramUser, notifType) {
    // Save notification preferences
    switch (notifType) {
      case 'market':
        telegramUser.preferences.quietHours = { enabled: true, start: '21:00', end: '07:00' };
        break;
      case 'always':
        telegramUser.preferences.quietHours = { enabled: false };
        break;
      case 'quiet':
        telegramUser.preferences.quietHours = { enabled: true, start: '21:00', end: '07:00' };
        break;
      case 'custom':
        telegramUser.preferences.quietHours = { enabled: true, start: '22:00', end: '08:00' };
        break;
    }

    await telegramUser.save();
    await this.completeOnboarding(chatId, messageId, telegramUser);
  }

  /**
   * Complete onboarding process
   */
  async completeOnboarding(chatId, messageId, telegramUser) {
    telegramUser.onboardingCompleted = true;
    telegramUser.onboardingStep = 0;
    await telegramUser.save();

    const completionMessage = `🎉 **Setup Complete!**\n\n` +
      `Welcome to your trading command center, ${telegramUser.firstName}!\n\n` +
      `✅ Trading style configured\n` +
      `✅ Alert preferences set\n` +
      `✅ Notification schedule saved\n\n` +
      `🚀 **You're all set!** Here's what you can do now:`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📊 View Dashboard', callback_data: 'main_dashboard' }, { text: '💼 Manage Subscriptions', callback_data: 'main_subscriptions' }],
        [{ text: '⚙️ Adjust Settings', callback_data: 'main_settings' }, { text: '❓ Get Help', callback_data: 'main_help' }],
        [{ text: '🎯 Start Trading!', callback_data: 'main_alerts' }]
      ]
    };

    await this.editMessage(chatId, messageId, completionMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    // Send a follow-up welcome message with tips
    setTimeout(async () => {
      const tipsMessage = `💡 **Quick Tips to Get Started:**\n\n` +
        `🔹 Use /help anytime for assistance\n` +
        `🔹 Check your dashboard for real-time stats\n` +
        `🔹 Customize settings anytime in ⚙️ Settings\n` +
        `🔹 Link your web account for full features\n\n` +
        `Happy trading! 📈`;
      
      await this.sendMessage(chatId, tipsMessage, { parse_mode: 'Markdown' });
    }, 2000);
  }

  /**
   * Skip onboarding step
   */
  async skipOnboardingStep(chatId, messageId, telegramUser) {
    const currentStep = telegramUser.onboardingStep;
    
    if (currentStep < 3) {
      telegramUser.onboardingStep = currentStep + 1;
      await telegramUser.save();
      await this.continueOnboardingFlow(chatId, telegramUser);
    } else {
      await this.completeOnboarding(chatId, messageId, telegramUser);
    }
  }

  /**
   * Show onboarding step 1 (for continuing users)
   */
  async showOnboardingStep1(chatId, firstName) {
    const message = `👋 Welcome back, ${firstName}!\n\n` +
      `Let's continue setting up your account.\n\n` +
      `**Step 1 of 3: Choose Your Trading Style**`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📈 Day Trader', callback_data: 'onboard_style_day' }],
        [{ text: '📊 Swing Trader', callback_data: 'onboard_style_swing' }],
        [{ text: '💼 Long-term Investor', callback_data: 'onboard_style_longterm' }],
        [{ text: '🎯 All Strategies', callback_data: 'onboard_style_all' }]
      ]
    };

    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Show onboarding step 2 (for continuing users)
   */
  async showOnboardingStep2(chatId, firstName) {
    const message = `📊 **Step 2 of 3: Alert Preferences**\n\n` +
      `What types of alerts would you like to receive?`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔔 All Alerts', callback_data: 'onboard_alerts_all' }],
        [{ text: '📈 Entry Signals Only', callback_data: 'onboard_alerts_entry' }],
        [{ text: '💰 P&L Updates Only', callback_data: 'onboard_alerts_pnl' }],
        [{ text: '🎯 Custom Selection', callback_data: 'onboard_alerts_custom' }]
      ]
    };

    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Show onboarding step 3 (for continuing users)
   */
  async showOnboardingStep3(chatId, firstName) {
    const message = `🔔 **Step 3 of 3: Notification Settings**\n\n` +
      `When would you like to receive notifications?`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🌅 Market Hours Only', callback_data: 'onboard_notifications_market' }],
        [{ text: '🌍 24/7 Notifications', callback_data: 'onboard_notifications_always' }],
        [{ text: '🌙 Quiet Hours (9PM-7AM)', callback_data: 'onboard_notifications_quiet' }],
        [{ text: '⚙️ Custom Schedule', callback_data: 'onboard_notifications_custom' }]
      ]
    };

    await this.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  /**
   * Send error message
   */
  async sendErrorMessage(chatId, errorText) {
    const message = `❌ ${errorText}`;
    await this.sendMessage(chatId, message);
  }

  /**
   * Send alert notification to subscribed users
   */
  async sendAlertNotification(alert) {
    try {
      // Find all subscribed users
      const subscribedUsers = await TelegramUser.find({
        isActive: true,
        isBlocked: false,
        'preferences.receiveAlerts': true
      });

      const message = formatAlertMessage(alert);
      const sentCount = 0;

      for (const user of subscribedUsers) {
        try {
          await this.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
          
          // Update user stats
          await user.updateStats({ alertsReceived: 1 });
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send alert to user ${user.telegramId}:`, error);
          
          // Mark user as blocked if bot was blocked
          if (error.response && error.response.body && error.response.body.error_code === 403) {
            user.isBlocked = true;
            await user.save();
          }
        }
      }

      logger.info(`Alert notification sent to ${sentCount} users`);
      return sentCount;
    } catch (error) {
      logger.error('Error sending alert notifications:', error);
      throw error;
    }
  }

  /**
   * Send trade update notification
   */
  async sendTradeUpdateNotification(trade) {
    try {
      // Find users subscribed to trade updates
      const subscribedUsers = await TelegramUser.find({
        isActive: true,
        isBlocked: false,
        'preferences.receiveTradeUpdates': true
      });

      const message = formatTradeMessage(trade);
      let sentCount = 0;

      for (const user of subscribedUsers) {
        try {
          await this.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' });
          sentCount++;
        } catch (error) {
          logger.error(`Failed to send trade update to user ${user.telegramId}:`, error);
        }
      }

      logger.info(`Trade update sent to ${sentCount} users`);
      return sentCount;
    } catch (error) {
      logger.error('Error sending trade update notifications:', error);
      throw error;
    }
  }

  /**
   * Get bot statistics
   */
  async getBotStats() {
    try {
      const stats = await TelegramUser.getUserStats();
      return stats[0] || {
        totalUsers: 0,
        activeUsers: 0,
        totalAlerts: 0,
        totalTrades: 0,
        totalPnL: 0
      };
    } catch (error) {
      logger.error('Error getting bot stats:', error);
      throw error;
    }
  }

  /**
   * Stop the bot
   */
  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      this.isInitialized = false;
      logger.info('Telegram bot stopped');
    }
  }
}

// Export singleton instance
module.exports = new TelegramBotService();