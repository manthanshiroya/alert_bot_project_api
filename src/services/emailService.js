const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');

class EmailService {
  constructor() {
    this.transporter = null;
    this.templates = new Map();
    this.init();
  }

  async init() {
    try {
      // Initialize email transporter
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify connection
      await this.transporter.verify();
      logger.info('Email service initialized successfully');

      // Load email templates
      await this.loadTemplates();
    } catch (error) {
      logger.error('Failed to initialize email service:', error);
      throw error;
    }
  }

  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, '../templates/email');
      const templateFiles = [
        'welcome.hbs',
        'subscription-confirmation.hbs',
        'payment-confirmation.hbs',
        'payment-rejected.hbs',
        'subscription-expiry-warning.hbs',
        'subscription-expired.hbs',
        'password-reset.hbs',
        'trade-alert.hbs'
      ];

      for (const file of templateFiles) {
        try {
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          const templateName = file.replace('.hbs', '');
          this.templates.set(templateName, handlebars.compile(templateContent));
        } catch (error) {
          logger.warn(`Template ${file} not found, skipping...`);
        }
      }

      logger.info(`Loaded ${this.templates.size} email templates`);
    } catch (error) {
      logger.error('Failed to load email templates:', error);
    }
  }

  async sendEmail(to, subject, templateName, data = {}, attachments = []) {
    try {
      if (!this.transporter) {
        throw new Error('Email service not initialized');
      }

      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      const html = template({
        ...data,
        currentYear: new Date().getFullYear(),
        appName: process.env.APP_NAME || 'Trading Alert Bot',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@tradingalert.com'
      });

      const mailOptions = {
        from: `${process.env.APP_NAME || 'Trading Alert Bot'} <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        attachments
      };

      const result = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${to}:`, result.messageId);
      return result;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  // Welcome email for new users
  async sendWelcomeEmail(user) {
    try {
      await this.sendEmail(
        user.email,
        'Welcome to Trading Alert Bot!',
        'welcome',
        {
          userName: user.profile.name,
          telegramUsername: user.telegram.username
        }
      );
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
    }
  }

  // Subscription confirmation email
  async sendSubscriptionConfirmation(user, subscription, plan) {
    try {
      await this.sendEmail(
        user.email,
        'Subscription Activated Successfully!',
        'subscription-confirmation',
        {
          userName: user.profile.name,
          planName: plan.name,
          planFeatures: plan.features,
          startDate: subscription.subscription.startDate,
          endDate: subscription.subscription.endDate,
          amount: subscription.payment.amount,
          currency: subscription.payment.currency
        }
      );
    } catch (error) {
      logger.error('Failed to send subscription confirmation email:', error);
    }
  }

  // Payment confirmation email
  async sendPaymentConfirmation(user, payment, plan) {
    try {
      await this.sendEmail(
        user.email,
        'Payment Received - Processing Subscription',
        'payment-confirmation',
        {
          userName: user.profile.name,
          planName: plan.name,
          amount: payment.amount,
          currency: payment.currency,
          transactionId: payment.transactionId,
          paymentDate: payment.createdAt
        }
      );
    } catch (error) {
      logger.error('Failed to send payment confirmation email:', error);
    }
  }

  // Payment rejection email
  async sendPaymentRejection(user, payment, plan, reason) {
    try {
      await this.sendEmail(
        user.email,
        'Payment Verification Failed',
        'payment-rejected',
        {
          userName: user.profile.name,
          planName: plan.name,
          amount: payment.amount,
          currency: payment.currency,
          transactionId: payment.transactionId,
          reason: reason,
          supportEmail: process.env.SUPPORT_EMAIL || 'support@tradingalert.com'
        }
      );
    } catch (error) {
      logger.error('Failed to send payment rejection email:', error);
    }
  }

  // Subscription expiry warning email
  async sendExpiryWarning(user, subscription, plan, daysRemaining) {
    try {
      await this.sendEmail(
        user.email,
        `Subscription Expiring in ${daysRemaining} Days`,
        'subscription-expiry-warning',
        {
          userName: user.profile.name,
          planName: plan.name,
          daysRemaining,
          expiryDate: subscription.subscription.endDate,
          renewalUrl: `${process.env.FRONTEND_URL}/subscription/renew`
        }
      );
    } catch (error) {
      logger.error('Failed to send expiry warning email:', error);
    }
  }

  // Subscription expired email
  async sendSubscriptionExpired(user, subscription, plan) {
    try {
      await this.sendEmail(
        user.email,
        'Subscription Expired',
        'subscription-expired',
        {
          userName: user.profile.name,
          planName: plan.name,
          expiredDate: subscription.subscription.endDate,
          renewalUrl: `${process.env.FRONTEND_URL}/subscription/renew`
        }
      );
    } catch (error) {
      logger.error('Failed to send subscription expired email:', error);
    }
  }

  // Password reset email
  async sendPasswordReset(user, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      
      await this.sendEmail(
        user.email,
        'Password Reset Request',
        'password-reset',
        {
          userName: user.profile.name,
          resetUrl,
          expiryTime: '1 hour'
        }
      );
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
    }
  }

  // Trade alert email (for users who prefer email notifications)
  async sendTradeAlert(user, alert, trade) {
    try {
      if (!user.preferences.notifications.email) {
        return; // User has disabled email notifications
      }

      await this.sendEmail(
        user.email,
        `Trade Alert: ${alert.alertData.signal} ${alert.alertData.symbol}`,
        'trade-alert',
        {
          userName: user.profile.name,
          symbol: alert.alertData.symbol,
          signal: alert.alertData.signal,
          timeframe: alert.alertData.timeframe,
          strategy: alert.alertData.strategy,
          entryPrice: alert.alertData.price,
          takeProfitPrice: alert.alertData.tp,
          stopLossPrice: alert.alertData.sl,
          tradeNumber: trade?.tradeNumber,
          alertTime: alert.webhook.receivedAt
        }
      );
    } catch (error) {
      logger.error('Failed to send trade alert email:', error);
    }
  }

  // Bulk email sending for announcements
  async sendBulkEmail(recipients, subject, templateName, data = {}) {
    try {
      const results = [];
      const batchSize = 50; // Send in batches to avoid rate limiting
      
      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        const batchPromises = batch.map(recipient => 
          this.sendEmail(recipient.email, subject, templateName, {
            ...data,
            userName: recipient.name
          })
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        results.push(...batchResults);
        
        // Wait between batches to avoid rate limiting
        if (i + batchSize < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      logger.info(`Bulk email completed: ${successful} successful, ${failed} failed`);
      return { successful, failed, results };
    } catch (error) {
      logger.error('Failed to send bulk email:', error);
      throw error;
    }
  }

  // Test email connectivity
  async testConnection() {
    try {
      if (!this.transporter) {
        throw new Error('Email service not initialized');
      }
      
      await this.transporter.verify();
      return { success: true, message: 'Email service is working correctly' };
    } catch (error) {
      logger.error('Email service test failed:', error);
      return { success: false, message: error.message };
    }
  }
}

module.exports = new EmailService();