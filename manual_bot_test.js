#!/usr/bin/env node

const TelegramBot = require('node-telegram-bot-api');
const readline = require('readline');
require('dotenv').config();

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

class ManualBotTester {
  constructor() {
    this.bot = null;
    this.rl = null;
    this.testChatId = process.env.TEST_CHAT_ID;
  }

  async initialize() {
    try {
      if (!process.env.TELEGRAM_BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN not found in environment variables');
      }

      this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
      
      // Test connection
      const botInfo = await this.bot.getMe();
      log(`\n🤖 Bot connected: @${botInfo.username}`, 'green');
      log(`Bot ID: ${botInfo.id}`, 'cyan');
      log(`Bot Name: ${botInfo.first_name}`, 'cyan');
      
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return true;
    } catch (error) {
      log(`❌ Failed to initialize bot: ${error.message}`, 'red');
      return false;
    }
  }

  async showMenu() {
    log('\n' + '='.repeat(50), 'blue');
    log('🧪 TELEGRAM BOT MANUAL TESTER', 'bold');
    log('='.repeat(50), 'blue');
    log('\nAvailable Test Options:', 'yellow');
    log('1. Send test message', 'cyan');
    log('2. Send alert simulation', 'cyan');
    log('3. Send message with keyboard', 'cyan');
    log('4. Test bot commands', 'cyan');
    log('5. Get bot info', 'cyan');
    log('6. Get chat info', 'cyan');
    log('7. Send custom message', 'cyan');
    log('8. Test error handling', 'cyan');
    log('9. Exit', 'cyan');
    log('\nNote: You need to set TEST_CHAT_ID in .env to send messages', 'yellow');
    
    if (!this.testChatId) {
      log('⚠️  TEST_CHAT_ID not configured - message sending will be skipped', 'yellow');
      log('💡 Get your chat ID by messaging @userinfobot on Telegram', 'blue');
    }
  }

  async sendTestMessage() {
    if (!this.testChatId) {
      log('❌ TEST_CHAT_ID not configured', 'red');
      return;
    }

    try {
      const message = `🧪 **Manual Test Message**\n\n` +
                     `Timestamp: ${new Date().toISOString()}\n` +
                     `Test ID: ${Math.random().toString(36).substr(2, 9)}\n\n` +
                     `This is a manual test to verify bot messaging functionality.`;
      
      const result = await this.bot.sendMessage(this.testChatId, message, {
        parse_mode: 'Markdown'
      });
      
      log('✅ Test message sent successfully', 'green');
      log(`Message ID: ${result.message_id}`, 'cyan');
    } catch (error) {
      log(`❌ Failed to send message: ${error.message}`, 'red');
    }
  }

  async sendAlertSimulation() {
    if (!this.testChatId) {
      log('❌ TEST_CHAT_ID not configured', 'red');
      return;
    }

    try {
      const alertMessage = `🚨 **TRADING ALERT #${Math.floor(Math.random() * 1000)}**\n\n` +
                          `📊 **Symbol:** BTCUSDT\n` +
                          `⏰ **Timeframe:** 1H\n` +
                          `📈 **Signal:** BUY\n` +
                          `💰 **Price:** $${(45000 + Math.random() * 1000).toFixed(2)}\n` +
                          `🎯 **Take Profit:** $${(46000 + Math.random() * 500).toFixed(2)}\n` +
                          `🛡️ **Stop Loss:** $${(44000 - Math.random() * 500).toFixed(2)}\n` +
                          `🔧 **Strategy:** Manual Test Strategy\n\n` +
                          `⚡ *This is a test alert - not real trading advice*`;
      
      const result = await this.bot.sendMessage(this.testChatId, alertMessage, {
        parse_mode: 'Markdown'
      });
      
      log('✅ Alert simulation sent successfully', 'green');
      log(`Message ID: ${result.message_id}`, 'cyan');
    } catch (error) {
      log(`❌ Failed to send alert: ${error.message}`, 'red');
    }
  }

  async sendMessageWithKeyboard() {
    if (!this.testChatId) {
      log('❌ TEST_CHAT_ID not configured', 'red');
      return;
    }

    try {
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Subscribe', callback_data: 'test_subscribe' },
            { text: '❌ Unsubscribe', callback_data: 'test_unsubscribe' }
          ],
          [
            { text: '⚙️ Settings', callback_data: 'test_settings' },
            { text: '📊 Stats', callback_data: 'test_stats' }
          ],
          [
            { text: '🔗 Link Account', callback_data: 'test_link' }
          ]
        ]
      };
      
      const message = `🧪 **Keyboard Test**\n\n` +
                     `This message includes interactive buttons.\n` +
                     `Click any button to test callback functionality.\n\n` +
                     `*Note: Buttons may not work if bot handlers aren't running*`;
      
      const result = await this.bot.sendMessage(this.testChatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
      log('✅ Message with keyboard sent successfully', 'green');
      log(`Message ID: ${result.message_id}`, 'cyan');
    } catch (error) {
      log(`❌ Failed to send keyboard message: ${error.message}`, 'red');
    }
  }

  async testBotCommands() {
    try {
      const commands = await this.bot.getMyCommands();
      log('\n📋 Bot Commands:', 'yellow');
      
      if (commands.length === 0) {
        log('❌ No commands configured', 'red');
        return;
      }
      
      commands.forEach((cmd, index) => {
        log(`${index + 1}. /${cmd.command} - ${cmd.description}`, 'cyan');
      });
      
      log('\n💡 To test commands:', 'blue');
      log('1. Open Telegram and find your bot', 'cyan');
      log('2. Send any of the commands above', 'cyan');
      log('3. Verify the bot responds correctly', 'cyan');
      
    } catch (error) {
      log(`❌ Failed to get commands: ${error.message}`, 'red');
    }
  }

  async getBotInfo() {
    try {
      const botInfo = await this.bot.getMe();
      log('\n🤖 Bot Information:', 'yellow');
      log(`ID: ${botInfo.id}`, 'cyan');
      log(`Username: @${botInfo.username}`, 'cyan');
      log(`First Name: ${botInfo.first_name}`, 'cyan');
      log(`Can Join Groups: ${botInfo.can_join_groups}`, 'cyan');
      log(`Can Read All Group Messages: ${botInfo.can_read_all_group_messages}`, 'cyan');
      log(`Supports Inline Queries: ${botInfo.supports_inline_queries}`, 'cyan');
    } catch (error) {
      log(`❌ Failed to get bot info: ${error.message}`, 'red');
    }
  }

  async getChatInfo() {
    if (!this.testChatId) {
      log('❌ TEST_CHAT_ID not configured', 'red');
      return;
    }

    try {
      const chatInfo = await this.bot.getChat(this.testChatId);
      log('\n💬 Chat Information:', 'yellow');
      log(`ID: ${chatInfo.id}`, 'cyan');
      log(`Type: ${chatInfo.type}`, 'cyan');
      if (chatInfo.username) log(`Username: @${chatInfo.username}`, 'cyan');
      if (chatInfo.first_name) log(`First Name: ${chatInfo.first_name}`, 'cyan');
      if (chatInfo.last_name) log(`Last Name: ${chatInfo.last_name}`, 'cyan');
    } catch (error) {
      log(`❌ Failed to get chat info: ${error.message}`, 'red');
    }
  }

  async sendCustomMessage() {
    if (!this.testChatId) {
      log('❌ TEST_CHAT_ID not configured', 'red');
      return;
    }

    return new Promise((resolve) => {
      this.rl.question('\nEnter your custom message: ', async (message) => {
        if (!message.trim()) {
          log('❌ Empty message', 'red');
          resolve();
          return;
        }

        try {
          const result = await this.bot.sendMessage(this.testChatId, message);
          log('✅ Custom message sent successfully', 'green');
          log(`Message ID: ${result.message_id}`, 'cyan');
        } catch (error) {
          log(`❌ Failed to send custom message: ${error.message}`, 'red');
        }
        resolve();
      });
    });
  }

  async testErrorHandling() {
    log('\n🛡️ Testing Error Handling:', 'yellow');
    
    // Test 1: Invalid chat ID
    try {
      await this.bot.sendMessage('invalid_chat_id', 'Test message');
    } catch (error) {
      log('✅ Invalid chat ID error handled correctly', 'green');
    }
    
    // Test 2: Empty message
    if (this.testChatId) {
      try {
        await this.bot.sendMessage(this.testChatId, '');
      } catch (error) {
        log('✅ Empty message error handled correctly', 'green');
      }
    }
    
    // Test 3: Invalid parse mode
    if (this.testChatId) {
      try {
        await this.bot.sendMessage(this.testChatId, 'Test', { parse_mode: 'Invalid' });
      } catch (error) {
        log('✅ Invalid parse mode error handled correctly', 'green');
      }
    }
    
    log('✅ Error handling tests completed', 'green');
  }

  async getUserChoice() {
    return new Promise((resolve) => {
      this.rl.question('\nSelect an option (1-9): ', (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async run() {
    const initialized = await this.initialize();
    if (!initialized) {
      process.exit(1);
    }

    while (true) {
      await this.showMenu();
      const choice = await this.getUserChoice();

      switch (choice) {
        case '1':
          await this.sendTestMessage();
          break;
        case '2':
          await this.sendAlertSimulation();
          break;
        case '3':
          await this.sendMessageWithKeyboard();
          break;
        case '4':
          await this.testBotCommands();
          break;
        case '5':
          await this.getBotInfo();
          break;
        case '6':
          await this.getChatInfo();
          break;
        case '7':
          await this.sendCustomMessage();
          break;
        case '8':
          await this.testErrorHandling();
          break;
        case '9':
          log('\n👋 Goodbye!', 'green');
          this.rl.close();
          process.exit(0);
          break;
        default:
          log('❌ Invalid option. Please select 1-9.', 'red');
      }

      // Wait for user to press enter before showing menu again
      await new Promise((resolve) => {
        this.rl.question('\nPress Enter to continue...', () => resolve());
      });
    }
  }
}

// Run the tester
if (require.main === module) {
  const tester = new ManualBotTester();
  tester.run().catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = ManualBotTester;