const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const User = require('../models/User');

/**
 * Middleware to verify JWT token for regular users
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if user exists and is active
        const user = await User.findById(decoded.userId).select('-password');
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        // Add user info to request object
        req.user = {
            userId: user._id,
            email: user.email,
            telegramUserId: user.telegramUserId
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }

        console.error('Token verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Middleware to verify JWT token for admin users
 */
const verifyAdminToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if token is for admin
        if (decoded.role !== 'admin') {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin token'
            });
        }

        // Check if admin exists and is active
        const admin = await AdminUser.findById(decoded.userId).select('-password');
        if (!admin || admin.status !== 'active') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired admin token'
            });
        }

        // Add admin info to request object
        req.admin = {
            adminId: admin._id,
            email: admin.email,
            role: admin.role,
            permissions: admin.permissions
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid admin token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Admin token expired'
            });
        }

        console.error('Admin token verification error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Middleware to check admin permissions
 * @param {string|Array} requiredPermissions - Permission(s) required to access the route
 */
const checkAdminPermissions = (requiredPermissions) => {
    return (req, res, next) => {
        try {
            if (!req.admin) {
                return res.status(401).json({
                    success: false,
                    message: 'Admin authentication required'
                });
            }

            const { role, permissions } = req.admin;

            // Super admin has all permissions
            if (role === 'super_admin') {
                return next();
            }

            // Convert single permission to array
            const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];

            // Check if admin has all required permissions
            const hasPermissions = required.every(permission => 
                permissions && permissions.includes(permission)
            );

            if (!hasPermissions) {
                return res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions',
                    required: required,
                    current: permissions || []
                });
            }

            next();
        } catch (error) {
            console.error('Permission check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };
};

/**
 * Middleware to check admin role
 * @param {string|Array} requiredRoles - Role(s) required to access the route
 */
const checkAdminRole = (requiredRoles) => {
    return (req, res, next) => {
        try {
            if (!req.admin) {
                return res.status(401).json({
                    success: false,
                    message: 'Admin authentication required'
                });
            }

            const { role } = req.admin;

            // Convert single role to array
            const required = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

            // Check if admin has required role
            if (!required.includes(role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Insufficient role privileges',
                    required: required,
                    current: role
                });
            }

            next();
        } catch (error) {
            console.error('Role check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // No token provided, continue without authentication
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await User.findById(decoded.userId).select('-password');
        if (user && user.isActive) {
            req.user = {
                userId: user._id,
                email: user.email,
                telegramUserId: user.telegramUserId
            };
        }

        next();
    } catch (error) {
        // Token verification failed, but continue without authentication
        next();
    }
};

module.exports = {
    verifyToken,
    verifyAdminToken,
    checkAdminPermissions,
    checkAdminRole,
    optionalAuth
};