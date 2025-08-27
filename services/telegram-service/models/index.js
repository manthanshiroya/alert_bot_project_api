/**
 * Models Index
 * Centralized export of all Telegram Service models
 */

const Bot = require('./Bot');
const Chat = require('./Chat');
const Message = require('./Message');
const Alert = require('./Alert');

module.exports = {
  Bot,
  Chat,
  Message,
  Alert
};