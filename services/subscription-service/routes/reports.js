const express = require('express');
const { AuthMiddleware, ValidationMiddleware, ErrorHandler } = require('../../../shared/middleware');
const { Logger } = require('../../../shared/utils/logger');
const ReportController = require('../controllers/ReportController');
const router = express.Router();

// Initialize dependencies
const logger = new Logger('report-routes');
const authMiddleware = new AuthMiddleware(logger);
const validationMiddleware = new ValidationMiddleware();
const errorHandler = new ErrorHandler(logger);
const reportController = new ReportController();

/**
 * @route GET /api/v1/reports/revenue
 * @desc Generate revenue report
 * @access Private (Admin only)
 */
router.get('/revenue',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.revenueReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      granularity = 'daily',
      planId,
      currency,
      includeRefunds = true,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      granularity,
      includeRefunds: includeRefunds === 'true'
    };
    
    if (planId) filters.planId = planId;
    if (currency) filters.currency = currency;
    
    const report = await reportController.generateRevenueReport(filters);
    
    logger.info('Revenue report generated', {
      startDate,
      endDate,
      granularity,
      totalRevenue: report.summary.totalRevenue,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'revenue');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/subscriptions
 * @desc Generate subscription analytics report
 * @access Private (Admin only)
 */
router.get('/subscriptions',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.subscriptionReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      planId,
      status,
      includeTrials = true,
      includeCancelled = true,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      includeTrials: includeTrials === 'true',
      includeCancelled: includeCancelled === 'true'
    };
    
    if (planId) filters.planId = planId;
    if (status) filters.status = status;
    
    const report = await reportController.generateSubscriptionReport(filters);
    
    logger.info('Subscription report generated', {
      startDate,
      endDate,
      totalSubscriptions: report.summary.totalSubscriptions,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'subscriptions');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="subscription-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/churn
 * @desc Generate churn analysis report
 * @access Private (Admin only)
 */
router.get('/churn',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.churnReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      granularity = 'monthly',
      planId,
      cohortAnalysis = false,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      granularity,
      cohortAnalysis: cohortAnalysis === 'true'
    };
    
    if (planId) filters.planId = planId;
    
    const report = await reportController.generateChurnReport(filters);
    
    logger.info('Churn report generated', {
      startDate,
      endDate,
      granularity,
      churnRate: report.summary.overallChurnRate,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'churn');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="churn-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/usage
 * @desc Generate usage analytics report
 * @access Private (Admin only)
 */
router.get('/usage',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.usageReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      metric,
      planId,
      granularity = 'daily',
      includeOverages = true,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      granularity,
      includeOverages: includeOverages === 'true'
    };
    
    if (metric) filters.metric = metric;
    if (planId) filters.planId = planId;
    
    const report = await reportController.generateUsageReport(filters);
    
    logger.info('Usage report generated', {
      startDate,
      endDate,
      metric,
      granularity,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'usage');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="usage-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/plans/performance
 * @desc Generate plan performance report
 * @access Private (Admin only)
 */
router.get('/plans/performance',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.planPerformanceQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      includeRevenue = true,
      includeChurn = true,
      includeConversions = true,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      includeRevenue: includeRevenue === 'true',
      includeChurn: includeChurn === 'true',
      includeConversions: includeConversions === 'true'
    };
    
    const report = await reportController.generatePlanPerformanceReport(filters);
    
    logger.info('Plan performance report generated', {
      startDate,
      endDate,
      plansAnalyzed: report.plans.length,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'plan-performance');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="plan-performance-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/customers
 * @desc Generate customer analytics report
 * @access Private (Admin only)
 */
router.get('/customers',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.customerReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      segmentBy = 'plan',
      includeLifetimeValue = true,
      includeActivity = true,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      segmentBy,
      includeLifetimeValue: includeLifetimeValue === 'true',
      includeActivity: includeActivity === 'true'
    };
    
    const report = await reportController.generateCustomerReport(filters);
    
    logger.info('Customer report generated', {
      startDate,
      endDate,
      segmentBy,
      totalCustomers: report.summary.totalCustomers,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'customers');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="customer-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/financial
 * @desc Generate financial summary report
 * @access Private (Admin only)
 */
router.get('/financial',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.financialReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      currency = 'USD',
      includeProjections = false,
      includeTaxes = true,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      currency,
      includeProjections: includeProjections === 'true',
      includeTaxes: includeTaxes === 'true'
    };
    
    const report = await reportController.generateFinancialReport(filters);
    
    logger.info('Financial report generated', {
      startDate,
      endDate,
      currency,
      totalRevenue: report.summary.totalRevenue,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'financial');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="financial-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/cohort
 * @desc Generate cohort analysis report
 * @access Private (Admin only)
 */
router.get('/cohort',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.cohortReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      cohortType = 'monthly',
      metric = 'retention',
      planId,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      cohortType,
      metric
    };
    
    if (planId) filters.planId = planId;
    
    const report = await reportController.generateCohortReport(filters);
    
    logger.info('Cohort report generated', {
      startDate,
      endDate,
      cohortType,
      metric,
      cohortsAnalyzed: report.cohorts.length,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'cohort');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="cohort-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/mrr
 * @desc Generate Monthly Recurring Revenue (MRR) report
 * @access Private (Admin only)
 */
router.get('/mrr',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.mrrReportQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      startDate,
      endDate,
      includeMovements = true,
      includePredictions = false,
      planId,
      format = 'json'
    } = req.query;
    
    const filters = {
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      includeMovements: includeMovements === 'true',
      includePredictions: includePredictions === 'true'
    };
    
    if (planId) filters.planId = planId;
    
    const report = await reportController.generateMRRReport(filters);
    
    logger.info('MRR report generated', {
      startDate,
      endDate,
      currentMRR: report.summary.currentMRR,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'mrr');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="mrr-report-${startDate}-${endDate}.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route POST /api/v1/reports/custom
 * @desc Generate custom report
 * @access Private (Admin only)
 */
router.post('/custom',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.customReportRequest
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      name,
      description,
      metrics,
      dimensions,
      filters,
      dateRange,
      format = 'json'
    } = req.body;
    
    const reportConfig = {
      name,
      description,
      metrics,
      dimensions,
      filters,
      dateRange,
      createdBy: req.user.id
    };
    
    const report = await reportController.generateCustomReport(reportConfig);
    
    logger.info('Custom report generated', {
      name,
      metrics: metrics.length,
      dimensions: dimensions.length,
      requestedBy: req.user.id
    });
    
    if (format === 'csv') {
      const csv = await reportController.convertReportToCSV(report, 'custom');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/\s+/g, '-').toLowerCase()}-report.csv"`);
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: report
    });
  })
);

/**
 * @route GET /api/v1/reports/scheduled
 * @desc Get scheduled reports
 * @access Private (Admin only)
 */
router.get('/scheduled',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    query: validationMiddleware.schemas.scheduledReportsQuery
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      status,
      type,
      page = 1,
      limit = 20
    } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (type) filters.type = type;
    
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: '-createdAt'
    };
    
    const result = await reportController.getScheduledReports(filters, options);
    
    logger.info('Scheduled reports retrieved', {
      count: result.docs.length,
      total: result.totalDocs,
      requestedBy: req.user.id
    });
    
    res.json({
      success: true,
      data: result.docs,
      pagination: {
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage
      }
    });
  })
);

/**
 * @route POST /api/v1/reports/schedule
 * @desc Schedule a report
 * @access Private (Admin only)
 */
router.post('/schedule',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    body: validationMiddleware.schemas.scheduleReportRequest
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const {
      name,
      type,
      config,
      schedule,
      recipients,
      format = 'json'
    } = req.body;
    
    const scheduledReport = await reportController.scheduleReport({
      name,
      type,
      config,
      schedule,
      recipients,
      format,
      createdBy: req.user.id
    });
    
    logger.info('Report scheduled', {
      reportId: scheduledReport.id,
      name,
      type,
      schedule,
      createdBy: req.user.id
    });
    
    res.status(201).json({
      success: true,
      message: 'Report scheduled successfully',
      data: scheduledReport
    });
  })
);

/**
 * @route PUT /api/v1/reports/scheduled/:id
 * @desc Update scheduled report
 * @access Private (Admin only)
 */
router.put('/scheduled/:id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id'),
    body: validationMiddleware.schemas.updateScheduledReport
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const scheduledReport = await reportController.updateScheduledReport(
      req.params.id,
      req.body
    );
    
    if (!scheduledReport) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled report not found'
      });
    }
    
    logger.info('Scheduled report updated', {
      reportId: req.params.id,
      updatedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Scheduled report updated successfully',
      data: scheduledReport
    });
  })
);

/**
 * @route DELETE /api/v1/reports/scheduled/:id
 * @desc Delete scheduled report
 * @access Private (Admin only)
 */
router.delete('/scheduled/:id',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  validationMiddleware.validate({
    params: validationMiddleware.schemas.objectId('id')
  }),
  errorHandler.asyncWrapper(async (req, res) => {
    const result = await reportController.deleteScheduledReport(req.params.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled report not found'
      });
    }
    
    logger.info('Scheduled report deleted', {
      reportId: req.params.id,
      deletedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'Scheduled report deleted successfully'
    });
  })
);

module.exports = router;