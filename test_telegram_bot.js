const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Test configuration
const TEST_CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  testChatId: process.env.TEST_CHAT_ID || null, // Add your chat ID for testing
  apiBaseUrl: 'http://localhost:3000/api',
  webhookUrl: 'http://localhost:3000/api/webhooks/tradingview'
};

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

class TelegramBotTester {
  constructor() {
    this.bot = null;
    this.testResults = {
      botConnection: false,
      commandTests: {},
      webhookTests: {},
      messageTests: {},
      errorHandling: {}
    };
  }

  async initialize() {
    try {
      if (!TEST_CONFIG.botToken) {
        throw new Error('TELEGRAM_BOT_TOKEN not found in environment variables');
      }

      this.bot = new TelegramBot(TEST_CONFIG.botToken);
      logSuccess('Test bot initialized successfully');
      return true;
    } catch (error) {
      logError(`Failed to initialize test bot: ${error.message}`);
      return false;
    }
  }

  async testBotConnection() {
    log('\n🔍 Testing Bot Connection...', 'bold');
    
    try {
      const botInfo = await this.bot.getMe();
      logSuccess(`Bot connected successfully: @${botInfo.username}`);
      logInfo(`Bot ID: ${botInfo.id}`);
      logInfo(`Bot Name: ${botInfo.first_name}`);
      
      this.testResults.botConnection = true;
      return true;
    } catch (error) {
      logError(`Bot connection failed: ${error.message}`);
      this.testResults.botConnection = false;
      return false;
    }
  }

  async testBotCommands() {
    log('\n🤖 Testing Bot Commands...', 'bold');
    
    try {
      const commands = await this.bot.getMyCommands();
      logSuccess(`Found ${commands.length} bot commands:`);
      
      commands.forEach(cmd => {
        logInfo(`  /${cmd.command} - ${cmd.description}`);
      });
      
      // Expected commands
      const expectedCommands = [
        'start', 'help', 'subscribe', 'unsubscribe', 
        'status', 'alerts', 'settings', 'stats', 'link'
      ];
      
      const foundCommands = commands.map(cmd => cmd.command);
      const missingCommands = expectedCommands.filter(cmd => !foundCommands.includes(cmd));
      
      if (missingCommands.length === 0) {
        logSuccess('All expected commands are configured');
        this.testResults.commandTests.setup = true;
      } else {
        logWarning(`Missing commands: ${missingCommands.join(', ')}`);
        this.testResults.commandTests.setup = false;
      }
      
      return true;
    } catch (error) {
      logError(`Failed to get bot commands: ${error.message}`);
      this.testResults.commandTests.setup = false;
      return false;
    }
  }

  async testSendMessage() {
    log('\n💬 Testing Message Sending...', 'bold');
    
    if (!TEST_CONFIG.testChatId) {
      logWarning('TEST_CHAT_ID not configured - skipping message tests');
      logInfo('To test messaging, add your chat ID to .env file as TEST_CHAT_ID');
      return false;
    }
    
    try {
      // Test simple message
      const message = await this.bot.sendMessage(
        TEST_CONFIG.testChatId, 
        '🧪 **Bot Test Message**\n\nThis is a test message to verify bot functionality.',
        { parse_mode: 'Markdown' }
      );
      
      logSuccess('Simple message sent successfully');
      
      // Test message with inline keyboard
      const keyboard = {
        inline_keyboard: [
          [{ text: '✅ Test Button 1', callback_data: 'test_1' }],
          [{ text: '🔄 Test Button 2', callback_data: 'test_2' }]
        ]
      };
      
      await this.bot.sendMessage(
        TEST_CONFIG.testChatId,
        '🧪 **Keyboard Test**\n\nThis message includes inline keyboard buttons.',
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
      
      logSuccess('Message with inline keyboard sent successfully');
      this.testResults.messageTests.sending = true;
      
      return true;
    } catch (error) {
      logError(`Failed to send test message: ${error.message}`);
      this.testResults.messageTests.sending = false;
      return false;
    }
  }

  async testWebhookEndpoint() {
    log('\n🔗 Testing Webhook Endpoint...', 'bold');
    
    try {
      // Test TradingView webhook with sample alert data
      const sampleAlert = {
        symbol: 'BTCUSDT',
        timeframe: '1h',
        signal: 'buy',
        price: '45000.50',
        strategy: 'Test Strategy',
        takeProfitPrice: '46000.00',
        stopLossPrice: '44000.00',
        timestamp: new Date().toISOString(),
        metadata: {
          volume: '1000',
          rsi: '35.5',
          macd: 'bullish'
        }
      };
      
      const response = await axios.post(TEST_CONFIG.webhookUrl, sampleAlert, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TradingView-Webhook'
        },
        timeout: 10000
      });
      
      if (response.status === 200) {
        logSuccess('Webhook endpoint responded successfully');
        logInfo(`Response: ${JSON.stringify(response.data)}`);
        this.testResults.webhookTests.endpoint = true;
      } else {
        logWarning(`Webhook returned status: ${response.status}`);
        this.testResults.webhookTests.endpoint = false;
      }
      
      return true;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        logError('Server is not running - start the server first');
      } else {
        logError(`Webhook test failed: ${error.message}`);
      }
      this.testResults.webhookTests.endpoint = false;
      return false;
    }
  }

  async testDatabaseOperations() {
    log('\n🗄️  Testing Database Operations...', 'bold');
    
    try {
      // Test creating a test Telegram user
      const testUserData = {
        telegramId: '123456789',
        firstName: 'Test',
        lastName: 'User',
        username: 'testuser'
      };
      
      const response = await axios.post(`${TEST_CONFIG.apiBaseUrl}/test/telegram-user`, testUserData, {
        timeout: 5000
      });
      
      if (response.status === 200 || response.status === 201) {
        logSuccess('Database operations working correctly');
        this.testResults.messageTests.database = true;
      }
      
      return true;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        logWarning('Test endpoint not found - this is expected in production');
        this.testResults.messageTests.database = 'skipped';
      } else {
        logError(`Database test failed: ${error.message}`);
        this.testResults.messageTests.database = false;
      }
      return false;
    }
  }

  async testErrorHandling() {
    log('\n🛡️  Testing Error Handling...', 'bold');
    
    try {
      // Test invalid webhook data
      const invalidData = {
        invalid: 'data',
        missing: 'required fields'
      };
      
      const response = await axios.post(TEST_CONFIG.webhookUrl, invalidData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
        validateStatus: () => true // Don't throw on error status
      });
      
      if (response.status >= 400) {
        logSuccess('Error handling working - invalid data rejected');
        this.testResults.errorHandling.invalidData = true;
      } else {
        logWarning('Server accepted invalid data - check validation');
        this.testResults.errorHandling.invalidData = false;
      }
      
      return true;
    } catch (error) {
      logError(`Error handling test failed: ${error.message}`);
      this.testResults.errorHandling.invalidData = false;
      return false;
    }
  }

  async runAllTests() {
    log('🧪 Starting Telegram Bot Functionality Tests', 'bold');
    log('=' .repeat(50), 'blue');
    
    // Initialize test bot
    const initialized = await this.initialize();
    if (!initialized) {
      logError('Cannot proceed with tests - bot initialization failed');
      return;
    }
    
    // Run all tests
    await this.testBotConnection();
    await this.testBotCommands();
    await this.testSendMessage();
    await this.testWebhookEndpoint();
    await this.testDatabaseOperations();
    await this.testErrorHandling();
    
    // Print summary
    this.printTestSummary();
  }

  printTestSummary() {
    log('\n📊 Test Results Summary', 'bold');
    log('=' .repeat(50), 'blue');
    
    const results = [
      ['Bot Connection', this.testResults.botConnection],
      ['Command Setup', this.testResults.commandTests.setup],
      ['Message Sending', this.testResults.messageTests.sending],
      ['Webhook Endpoint', this.testResults.webhookTests.endpoint],
      ['Database Operations', this.testResults.messageTests.database],
      ['Error Handling', this.testResults.errorHandling.invalidData]
    ];
    
    let passedTests = 0;
    let totalTests = 0;
    
    results.forEach(([testName, result]) => {
      if (result === 'skipped') {
        log(`⏭️  ${testName}: SKIPPED`, 'yellow');
      } else if (result) {
        log(`✅ ${testName}: PASSED`, 'green');
        passedTests++;
        totalTests++;
      } else {
        log(`❌ ${testName}: FAILED`, 'red');
        totalTests++;
      }
    });
    
    log('\n' + '=' .repeat(50), 'blue');
    
    if (passedTests === totalTests) {
      log(`🎉 All tests passed! (${passedTests}/${totalTests})`, 'green');
    } else {
      log(`⚠️  ${passedTests}/${totalTests} tests passed`, 'yellow');
    }
    
    // Recommendations
    log('\n💡 Recommendations:', 'bold');
    
    if (!this.testResults.botConnection) {
      log('• Check TELEGRAM_BOT_TOKEN in environment variables', 'yellow');
    }
    
    if (!this.testResults.messageTests.sending) {
      log('• Add TEST_CHAT_ID to .env file to test messaging', 'yellow');
      log('• Get your chat ID by messaging @userinfobot on Telegram', 'yellow');
    }
    
    if (!this.testResults.webhookTests.endpoint) {
      log('• Ensure the server is running on port 3000', 'yellow');
      log('• Check webhook endpoint implementation', 'yellow');
    }
    
    log('\n🚀 Next Steps:', 'bold');
    log('• Test bot commands manually by messaging your bot', 'blue');
    log('• Send real TradingView alerts to test end-to-end flow', 'blue');
    log('• Monitor logs for any runtime errors', 'blue');
    log('• Test with multiple users to verify scalability', 'blue');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new TelegramBotTester();
  tester.runAllTests().catch(error => {
    logError(`Test execution failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = TelegramBotTester;