const { body } = require('express-validator');

const validateUPIConfig = [
  body('upiId')
    .optional()
    .matches('^[a-zA-Z0-9.-]{2,256}@[a-zA-Z][a-zA-Z]{2,64}$')
    .withMessage('Must be a valid UPI ID'),
  body('merchantName')
    .optional()
    .isLength({ min: 3, max: 100 })
    .withMessage('Merchant name must be between 3 and 100 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('Must be a boolean value')
];

module.exports = {
  validateUPIConfig
};