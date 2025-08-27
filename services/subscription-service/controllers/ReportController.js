const { User, Subscription, Plan } = require('../models');
const { Logger } = require('../../../shared/utils/logger');
const { ValidationError, NotFoundError } = require('../../../shared/utils/errors');
const { CacheService } = require('../../../shared/services/cache');
const { DataExporter } = require('../../../shared/utils/export');
const moment = require('moment');
const { v4: uuidv4 } = require('uuid');

class ReportController {
  constructor() {
    this.logger = new Logger('report-controller');
    this.cacheService = new CacheService();
    this.dataExporter = new DataExporter();
    
    // Cache TTL for different report types
    this.cacheTTL = {
      revenue: 3600, // 1 hour
      analytics: 1800, // 30 minutes
      churn: 7200, // 2 hours
      usage: 900, // 15 minutes
      performance: 3600, // 1 hour
      customer: 1800, // 30 minutes
      financial: 3600, // 1 hour
      cohort: 7200, // 2 hours
      mrr: 3600, // 1 hour
      custom: 1800 // 30 minutes
    };
  }

  /**
   * Generate revenue report
   */
  async generateRevenueReport(req, res) {
    try {
      const {
        startDate,
        endDate,
        granularity = 'monthly',
        planId,
        currency,
        includeRefunds = false,
        format = 'json'
      } = req.query;

      // Validate date range
      const start = moment(startDate || moment().subtract(12, 'months'));
      const end = moment(endDate || moment());

      if (end.diff(start, 'days') > 365) {
        throw new ValidationError('Date range cannot exceed 365 days');
      }

      // Generate cache key
      const cacheKey = `revenue_report:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${granularity}:${planId || 'all'}:${currency || 'all'}:${includeRefunds}`;
      
      // Check cache
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateRevenueData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          granularity,
          planId,
          currency,
          includeRefunds
        });
        
        // Cache the result
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.revenue);
      }

      this.logger.info('Revenue report generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        granularity,
        totalRevenue: reportData.summary.totalRevenue
      });

      // Export if requested
      if (format !== 'json') {
        return this._exportReport(res, reportData, 'revenue', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey),
          filters: {
            startDate: start.format('YYYY-MM-DD'),
            endDate: end.format('YYYY-MM-DD'),
            granularity,
            planId,
            currency,
            includeRefunds
          }
        }
      });
    } catch (error) {
      this.logger.error('Error generating revenue report', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate subscription analytics report
   */
  async generateSubscriptionAnalytics(req, res) {
    try {
      const {
        startDate,
        endDate,
        planId,
        status,
        includeTrials = true,
        includeCancellations = true,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(6, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `subscription_analytics:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${planId || 'all'}:${status || 'all'}:${includeTrials}:${includeCancellations}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateSubscriptionAnalyticsData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          planId,
          status,
          includeTrials,
          includeCancellations
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.analytics);
      }

      this.logger.info('Subscription analytics generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        totalSubscriptions: reportData.summary.totalSubscriptions
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'subscription-analytics', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating subscription analytics', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate churn analysis report
   */
  async generateChurnAnalysis(req, res) {
    try {
      const {
        startDate,
        endDate,
        granularity = 'monthly',
        planId,
        cohortAnalysis = false,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(12, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `churn_analysis:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${granularity}:${planId || 'all'}:${cohortAnalysis}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateChurnAnalysisData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          granularity,
          planId,
          cohortAnalysis
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.churn);
      }

      this.logger.info('Churn analysis generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        churnRate: reportData.summary.overallChurnRate
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'churn-analysis', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating churn analysis', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate usage analytics report
   */
  async generateUsageAnalytics(req, res) {
    try {
      const {
        startDate,
        endDate,
        metric,
        planId,
        granularity = 'daily',
        includeOverages = true,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(30, 'days'));
      const end = moment(endDate || moment());

      const cacheKey = `usage_analytics:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${metric || 'all'}:${planId || 'all'}:${granularity}:${includeOverages}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateUsageAnalyticsData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          metric,
          planId,
          granularity,
          includeOverages
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.usage);
      }

      this.logger.info('Usage analytics generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        metric,
        totalUsage: reportData.summary.totalUsage
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'usage-analytics', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating usage analytics', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate plan performance report
   */
  async generatePlanPerformance(req, res) {
    try {
      const {
        startDate,
        endDate,
        includeRevenue = true,
        includeChurn = true,
        includeConversions = true,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(6, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `plan_performance:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${includeRevenue}:${includeChurn}:${includeConversions}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generatePlanPerformanceData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          includeRevenue,
          includeChurn,
          includeConversions
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.performance);
      }

      this.logger.info('Plan performance report generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        plansAnalyzed: reportData.plans.length
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'plan-performance', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating plan performance report', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate customer analytics report
   */
  async generateCustomerAnalytics(req, res) {
    try {
      const {
        startDate,
        endDate,
        segmentation = 'plan',
        includeLifetimeValue = true,
        includeActivity = true,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(12, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `customer_analytics:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${segmentation}:${includeLifetimeValue}:${includeActivity}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateCustomerAnalyticsData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          segmentation,
          includeLifetimeValue,
          includeActivity
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.customer);
      }

      this.logger.info('Customer analytics generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        totalCustomers: reportData.summary.totalCustomers
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'customer-analytics', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating customer analytics', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate financial summary report
   */
  async generateFinancialSummary(req, res) {
    try {
      const {
        startDate,
        endDate,
        currency,
        includeProjections = false,
        includeTaxes = false,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(12, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `financial_summary:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${currency || 'all'}:${includeProjections}:${includeTaxes}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateFinancialSummaryData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          currency,
          includeProjections,
          includeTaxes
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.financial);
      }

      this.logger.info('Financial summary generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        totalRevenue: reportData.summary.totalRevenue
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'financial-summary', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating financial summary', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate cohort analysis report
   */
  async generateCohortAnalysis(req, res) {
    try {
      const {
        startDate,
        endDate,
        cohortType = 'monthly',
        metric = 'retention',
        planId,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(12, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `cohort_analysis:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${cohortType}:${metric}:${planId || 'all'}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateCohortAnalysisData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          cohortType,
          metric,
          planId
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.cohort);
      }

      this.logger.info('Cohort analysis generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        cohortType,
        metric,
        cohortsAnalyzed: reportData.cohorts.length
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'cohort-analysis', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating cohort analysis', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate MRR (Monthly Recurring Revenue) report
   */
  async generateMRRReport(req, res) {
    try {
      const {
        startDate,
        endDate,
        includeMovements = true,
        includePredictions = false,
        planId,
        format = 'json'
      } = req.query;

      const start = moment(startDate || moment().subtract(12, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `mrr_report:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}:${includeMovements}:${includePredictions}:${planId || 'all'}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateMRRData({
          startDate: start.toDate(),
          endDate: end.toDate(),
          includeMovements,
          includePredictions,
          planId
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.mrr);
      }

      this.logger.info('MRR report generated', {
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD'),
        currentMRR: reportData.summary.currentMRR
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'mrr-report', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating MRR report', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Generate custom report
   */
  async generateCustomReport(req, res) {
    try {
      const {
        metrics,
        dimensions,
        filters,
        startDate,
        endDate,
        format = 'json'
      } = req.body;

      if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        throw new ValidationError('Metrics array is required');
      }

      const start = moment(startDate || moment().subtract(3, 'months'));
      const end = moment(endDate || moment());

      const cacheKey = `custom_report:${JSON.stringify({ metrics, dimensions, filters })}:${start.format('YYYY-MM-DD')}:${end.format('YYYY-MM-DD')}`;
      
      let reportData = await this.cacheService.get(cacheKey);
      
      if (!reportData) {
        reportData = await this._generateCustomReportData({
          metrics,
          dimensions,
          filters,
          startDate: start.toDate(),
          endDate: end.toDate()
        });
        
        await this.cacheService.set(cacheKey, reportData, this.cacheTTL.custom);
      }

      this.logger.info('Custom report generated', {
        metrics,
        dimensions,
        startDate: start.format('YYYY-MM-DD'),
        endDate: end.format('YYYY-MM-DD')
      });

      if (format !== 'json') {
        return this._exportReport(res, reportData, 'custom-report', format);
      }

      res.json({
        success: true,
        data: reportData,
        meta: {
          generatedAt: new Date(),
          cached: !!await this.cacheService.get(cacheKey)
        }
      });
    } catch (error) {
      this.logger.error('Error generating custom report', { error: error.message, body: req.body });
      throw error;
    }
  }

  /**
   * Get scheduled reports
   */
  async getScheduledReports(req, res) {
    try {
      const { page = 1, limit = 20, status, type } = req.query;

      // This would typically query a ScheduledReport collection
      // For now, return sample data
      const reports = this._generateSampleScheduledReports({
        page: parseInt(page),
        limit: parseInt(limit),
        status,
        type
      });

      res.json({
        success: true,
        data: reports.docs,
        pagination: {
          page: reports.page,
          pages: reports.totalPages,
          total: reports.totalDocs,
          limit: reports.limit
        }
      });
    } catch (error) {
      this.logger.error('Error retrieving scheduled reports', { error: error.message, query: req.query });
      throw error;
    }
  }

  /**
   * Schedule a report
   */
  async scheduleReport(req, res) {
    try {
      const {
        type,
        name,
        description,
        schedule,
        parameters,
        recipients,
        format = 'json'
      } = req.body;

      if (!type || !name || !schedule) {
        throw new ValidationError('Type, name, and schedule are required');
      }

      // Create scheduled report
      const scheduledReport = {
        id: uuidv4(),
        type,
        name,
        description,
        schedule,
        parameters: parameters || {},
        recipients: recipients || [],
        format,
        status: 'active',
        createdAt: new Date(),
        createdBy: req.user.userId,
        lastRun: null,
        nextRun: this._calculateNextRun(schedule)
      };

      // This would typically save to a ScheduledReport collection
      // For now, just log and return the created report
      
      this.logger.info('Report scheduled', {
        reportId: scheduledReport.id,
        type,
        name,
        schedule,
        createdBy: req.user.userId
      });

      res.json({
        success: true,
        data: scheduledReport,
        message: 'Report scheduled successfully'
      });
    } catch (error) {
      this.logger.error('Error scheduling report', { error: error.message, body: req.body });
      throw error;
    }
  }

  /**
   * Update scheduled report
   */
  async updateScheduledReport(req, res) {
    try {
      const { reportId } = req.params;
      const updates = req.body;

      // This would typically update a ScheduledReport document
      // For now, just return success
      
      this.logger.info('Scheduled report updated', {
        reportId,
        updates: Object.keys(updates),
        updatedBy: req.user.userId
      });

      res.json({
        success: true,
        message: 'Scheduled report updated successfully'
      });
    } catch (error) {
      this.logger.error('Error updating scheduled report', { error: error.message, reportId: req.params.reportId });
      throw error;
    }
  }

  /**
   * Delete scheduled report
   */
  async deleteScheduledReport(req, res) {
    try {
      const { reportId } = req.params;

      // This would typically delete a ScheduledReport document
      // For now, just return success
      
      this.logger.info('Scheduled report deleted', {
        reportId,
        deletedBy: req.user.userId
      });

      res.json({
        success: true,
        message: 'Scheduled report deleted successfully'
      });
    } catch (error) {
      this.logger.error('Error deleting scheduled report', { error: error.message, reportId: req.params.reportId });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  async _generateRevenueData(options) {
    // This would typically aggregate subscription billing data
    // For now, return sample data structure
    return {
      summary: {
        totalRevenue: 125000,
        averageRevenue: 10416.67,
        growth: 15.2,
        currency: options.currency || 'USD'
      },
      periods: [
        {
          period: '2024-01',
          revenue: 8500,
          subscriptions: 85,
          averageRevenuePerUser: 100
        },
        {
          period: '2024-02',
          revenue: 9200,
          subscriptions: 92,
          averageRevenuePerUser: 100
        }
      ],
      breakdown: {
        byPlan: [],
        byCurrency: [],
        byRegion: []
      }
    };
  }

  async _generateSubscriptionAnalyticsData(options) {
    return {
      summary: {
        totalSubscriptions: 450,
        activeSubscriptions: 380,
        trialSubscriptions: 45,
        canceledSubscriptions: 25,
        conversionRate: 84.4
      },
      trends: [],
      breakdown: {
        byPlan: [],
        byStatus: [],
        byRegion: []
      }
    };
  }

  async _generateChurnAnalysisData(options) {
    return {
      summary: {
        overallChurnRate: 5.2,
        monthlyChurnRate: 4.8,
        annualChurnRate: 45.6,
        churnedRevenue: 12500
      },
      periods: [],
      cohorts: [],
      reasons: []
    };
  }

  async _generateUsageAnalyticsData(options) {
    return {
      summary: {
        totalUsage: 1250000,
        averageUsage: 2777.78,
        peakUsage: 15000,
        overageCharges: 2500
      },
      trends: [],
      breakdown: {
        byMetric: [],
        byPlan: [],
        byUser: []
      }
    };
  }

  async _generatePlanPerformanceData(options) {
    return {
      plans: [],
      summary: {
        totalPlans: 5,
        bestPerforming: 'Pro Plan',
        worstPerforming: 'Basic Plan'
      },
      metrics: {
        revenue: [],
        subscriptions: [],
        churn: [],
        conversions: []
      }
    };
  }

  async _generateCustomerAnalyticsData(options) {
    return {
      summary: {
        totalCustomers: 450,
        activeCustomers: 380,
        averageLifetimeValue: 1250,
        averageMonthlyValue: 125
      },
      segments: [],
      cohorts: [],
      activity: []
    };
  }

  async _generateFinancialSummaryData(options) {
    return {
      summary: {
        totalRevenue: 125000,
        totalRefunds: 2500,
        netRevenue: 122500,
        taxes: 12250,
        fees: 3750
      },
      breakdown: {
        byCurrency: [],
        byMonth: [],
        byPlan: []
      },
      projections: options.includeProjections ? [] : null
    };
  }

  async _generateCohortAnalysisData(options) {
    return {
      cohorts: [],
      summary: {
        totalCohorts: 12,
        averageRetention: 75.5,
        bestCohort: '2024-01',
        worstCohort: '2023-06'
      },
      matrix: []
    };
  }

  async _generateMRRData(options) {
    return {
      summary: {
        currentMRR: 38500,
        previousMRR: 35200,
        growth: 9.4,
        churnMRR: 1800,
        expansionMRR: 5100
      },
      movements: options.includeMovements ? [] : null,
      trends: [],
      predictions: options.includePredictions ? [] : null
    };
  }

  async _generateCustomReportData(options) {
    return {
      metrics: options.metrics,
      dimensions: options.dimensions,
      data: [],
      summary: {},
      filters: options.filters
    };
  }

  async _exportReport(res, data, reportType, format) {
    try {
      const exportResult = await this.dataExporter.exportReport({
        data,
        format,
        reportType
      });

      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${moment().format('YYYY-MM-DD')}.${format}"`);
      res.send(exportResult.buffer);
    } catch (error) {
      this.logger.error('Error exporting report', { error: error.message, reportType, format });
      throw error;
    }
  }

  _generateSampleScheduledReports(options) {
    const reports = [
      {
        id: 'report_1',
        type: 'revenue',
        name: 'Monthly Revenue Report',
        status: 'active',
        schedule: 'monthly',
        lastRun: new Date(),
        nextRun: moment().add(1, 'month').toDate()
      }
    ];

    return {
      docs: reports,
      totalDocs: reports.length,
      page: options.page,
      totalPages: Math.ceil(reports.length / options.limit),
      limit: options.limit
    };
  }

  _calculateNextRun(schedule) {
    const now = moment();
    
    switch (schedule) {
      case 'daily':
        return now.add(1, 'day').toDate();
      case 'weekly':
        return now.add(1, 'week').toDate();
      case 'monthly':
        return now.add(1, 'month').toDate();
      case 'quarterly':
        return now.add(3, 'months').toDate();
      default:
        return now.add(1, 'day').toDate();
    }
  }
}

module.exports = ReportController;