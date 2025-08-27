const appConfig = require('./app');
const databaseConfig = require('./database');
const redisConfig = require('./redis');

module.exports = {
  app: appConfig,
  database: databaseConfig,
  redis: redisConfig
};