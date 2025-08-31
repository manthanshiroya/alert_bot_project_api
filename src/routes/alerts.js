const express = require('express');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Alert:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Unique alert identifier
 *         userId:
 *           type: string
 *           description: ID of the user who created the alert
 *         symbol:
 *           type: string
 *           description: Trading symbol (e.g., BTCUSDT)
 *         condition:
 *           type: string
 *           enum: [above, below, crosses_above, crosses_below]
 *           description: Alert condition type
 *         targetPrice:
 *           type: number
 *           description: Target price for the alert
 *         currentPrice:
 *           type: number
 *           description: Current price when alert was created
 *         isActive:
 *           type: boolean
 *           description: Whether the alert is active
 *         isTriggered:
 *           type: boolean
 *           description: Whether the alert has been triggered
 *         triggeredAt:
 *           type: string
 *           format: date-time
 *           description: When the alert was triggered
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When the alert was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When the alert was last updated
 *         notes:
 *           type: string
 *           description: Optional notes for the alert
 *       required:
 *         - symbol
 *         - condition
 *         - targetPrice
 *     AlertRequest:
 *       type: object
 *       properties:
 *         symbol:
 *           type: string
 *           description: Trading symbol (e.g., BTCUSDT)
 *         condition:
 *           type: string
 *           enum: [above, below, crosses_above, crosses_below]
 *           description: Alert condition type
 *         targetPrice:
 *           type: number
 *           minimum: 0
 *           description: Target price for the alert
 *         notes:
 *           type: string
 *           description: Optional notes for the alert
 *       required:
 *         - symbol
 *         - condition
 *         - targetPrice
 *     AlertHistory:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: History entry identifier
 *         alertId:
 *           type: string
 *           description: Associated alert ID
 *         action:
 *           type: string
 *           enum: [created, updated, triggered, deleted, activated, deactivated]
 *           description: Action performed
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: When the action occurred
 *         details:
 *           type: object
 *           description: Additional details about the action
 *         price:
 *           type: number
 *           description: Price at the time of action
 */

// Placeholder for alert controller (will be implemented later)
const alertController = {
  getAlerts: (req, res) => {
    res.status(501).json({
      status: 'error',
      message: 'Get alerts endpoint not implemented yet'
    });
  },
  createAlert: (req, res) => {
    res.status(501).json({
      status: 'error',
      message: 'Create alert endpoint not implemented yet'
    });
  },
  updateAlert: (req, res) => {
    res.status(501).json({
      status: 'error',
      message: 'Update alert endpoint not implemented yet'
    });
  },
  deleteAlert: (req, res) => {
    res.status(501).json({
      status: 'error',
      message: 'Delete alert endpoint not implemented yet'
    });
  },
  getAlertById: (req, res) => {
    res.status(501).json({
      status: 'error',
      message: 'Get alert by ID endpoint not implemented yet'
    });
  },
  getAlertHistory: (req, res) => {
    res.status(501).json({
      status: 'error',
      message: 'Get alert history endpoint not implemented yet'
    });
  }
};

// Alert routes

/**
 * @swagger
 * /api/v1/alerts:
 *   get:
 *     summary: Get user alerts
 *     description: Retrieve all alerts for the authenticated user with pagination and filtering
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of alerts per page
 *       - in: query
 *         name: symbol
 *         schema:
 *           type: string
 *         description: Filter by trading symbol
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: isTriggered
 *         schema:
 *           type: boolean
 *         description: Filter by triggered status
 *     responses:
 *       200:
 *         description: Alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     alerts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Alert'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', alertController.getAlerts);

/**
 * @swagger
 * /api/v1/alerts:
 *   post:
 *     summary: Create new alert
 *     description: Create a new price alert for a trading symbol
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AlertRequest'
 *     responses:
 *       201:
 *         description: Alert created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Alert created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Alert'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/', alertController.createAlert);

/**
 * @swagger
 * /api/v1/alerts/{id}:
 *   get:
 *     summary: Get alert by ID
 *     description: Retrieve a specific alert by its ID
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Alert'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:id', alertController.getAlertById);

/**
 * @swagger
 * /api/v1/alerts/{id}:
 *   put:
 *     summary: Update alert
 *     description: Update an existing alert's properties
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               condition:
 *                 type: string
 *                 enum: [above, below, crosses_above, crosses_below]
 *                 description: Alert condition type
 *               targetPrice:
 *                 type: number
 *                 minimum: 0
 *                 description: Target price for the alert
 *               notes:
 *                 type: string
 *                 description: Optional notes for the alert
 *               isActive:
 *                 type: boolean
 *                 description: Whether the alert is active
 *     responses:
 *       200:
 *         description: Alert updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Alert updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Alert'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.put('/:id', alertController.updateAlert);

/**
 * @swagger
 * /api/v1/alerts/{id}:
 *   delete:
 *     summary: Delete alert
 *     description: Delete an existing alert
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert ID
 *     responses:
 *       200:
 *         description: Alert deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Alert deleted successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/:id', alertController.deleteAlert);

/**
 * @swagger
 * /api/v1/alerts/{id}/history:
 *   get:
 *     summary: Get alert history
 *     description: Retrieve the history of actions performed on a specific alert
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of history entries per page
 *     responses:
 *       200:
 *         description: Alert history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     history:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AlertHistory'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Alert not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:id/history', alertController.getAlertHistory);

module.exports = router;