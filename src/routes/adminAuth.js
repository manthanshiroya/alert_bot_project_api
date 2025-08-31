const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const AdminUser = require('../models/AdminUser');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Admin login validation
const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
];

/**
 * @swagger
 * /api/admin/auth/login:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Admin login endpoint
 *     description: Authenticate admin user and receive JWT token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Admin email address
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 description: Admin password
 *               rememberMe:
 *                 type: boolean
 *                 description: Set to true for 30-day token expiry
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   description: JWT token for authentication
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked due to too many failed attempts
 *       500:
 *         description: Internal server error
 */
router.post('/login', loginValidation, async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email, password, rememberMe } = req.body;

        // Find admin user
        const admin = await AdminUser.findOne({ email, status: 'active' }).select('+password');
        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, admin.password);
        if (!isPasswordValid) {
            // Log failed login attempt
            admin.lastLoginAttempt = new Date();
            admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
            await admin.save();

            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is locked due to too many failed attempts
        if (admin.failedLoginAttempts >= 5) {
            const lockoutTime = 15 * 60 * 1000; // 15 minutes
            const timeSinceLastAttempt = Date.now() - admin.lastLoginAttempt.getTime();
            
            if (timeSinceLastAttempt < lockoutTime) {
                return res.status(423).json({
                    success: false,
                    message: 'Account temporarily locked due to multiple failed login attempts. Please try again later.'
                });
            }
        }

        // Generate JWT token
        const tokenExpiry = rememberMe ? '30d' : '24h';
        const token = jwt.sign(
            { 
                userId: admin._id,  // Changed from adminId to userId
                role: 'admin',      // Added explicit role
                type: 'access'      // Added token type
            },
            process.env.JWT_SECRET,
            { expiresIn: tokenExpiry }
        );

        // Update admin login info
        admin.lastLogin = new Date();
        admin.lastLoginIP = req.ip || req.connection.remoteAddress;
        admin.failedLoginAttempts = 0; // Reset failed attempts
        await admin.save();

        // Return success response
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: 'admin',
                permissions: admin.permissions
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * @swagger
 * /api/admin/auth/verify:
 *   get:
 *     tags: [Admin Authentication]
 *     summary: Verify admin token
 *     description: Verify the admin JWT token and get user information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Invalid or expired token
 *       500:
 *         description: Internal server error
 */
router.get('/verify', authMiddleware.verifyAdminToken, async (req, res) => {
    try {
        const admin = await AdminUser.findById(req.admin.adminId)
            .select('-password')
            .lean();

        if (!admin || !admin.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        res.json({
            success: true,
            user: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                permissions: admin.permissions
            }
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * @swagger
 * /api/admin/auth/logout:
 *   post:
 *     tags: [Admin Authentication]
 *     summary: Admin logout
 *     description: Logout admin user and invalidate token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
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
 *                   example: Logout successful
 *       401:
 *         description: Invalid or expired token
 *       500:
 *         description: Internal server error
 */
router.post('/logout', authMiddleware.verifyAdminToken, async (req, res) => {
    try {
        // In a more sophisticated setup, you might want to blacklist the token
        // For now, we'll just return success and let the client handle token removal
        
        res.json({
            success: true,
            message: 'Logout successful'
        });

    } catch (error) {
        console.error('Admin logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

/**
 * @swagger
 * /api/admin/auth/profile:
 *   get:
 *     tags: [Admin Authentication]
 *     summary: Get admin profile
 *     description: Get the current admin user's profile information
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         description: Invalid or expired token
 *       404:
 *         description: Admin not found
 *       500:
 *         description: Internal server error
 */
router.get('/profile', authMiddleware.verifyAdminToken, async (req, res) => {
    try {
        const admin = await AdminUser.findById(req.admin.adminId)
            .select('-password')
            .lean();

        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        res.json({
            success: true,
            data: admin
        });

    } catch (error) {
        console.error('Get admin profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Update admin profile
router.put('/profile', [
    authMiddleware.verifyAdminToken,
    body('name')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters'),
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { name, email } = req.body;
        const adminId = req.admin.adminId;

        // Check if email is already taken by another admin
        if (email) {
            const existingAdmin = await AdminUser.findOne({ 
                email, 
                _id: { $ne: adminId } 
            });
            
            if (existingAdmin) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already in use'
                });
            }
        }

        // Update admin profile
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        updateData.updatedAt = new Date();

        const admin = await AdminUser.findByIdAndUpdate(
            adminId,
            updateData,
            { new: true, select: '-password' }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: admin
        });

    } catch (error) {
        console.error('Update admin profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Change admin password
router.put('/change-password', [
    authMiddleware.verifyAdminToken,
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { currentPassword, newPassword } = req.body;
        const adminId = req.admin.adminId;

        // Get admin with password
        const admin = await AdminUser.findById(adminId);
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.password);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        admin.password = hashedNewPassword;
        admin.passwordChangedAt = new Date();
        admin.updatedAt = new Date();
        await admin.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;