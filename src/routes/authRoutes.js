const express = require('express');
const router = express.Router();

const {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword
} = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema
} = require('../validations/authValidation');

// Public endpoints with strict auth rate limits
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);

// Protected endpoints (require JWT)
router.post('/logout', protect, logout);
router.get('/profile', protect, getProfile);
router.put('/profile', protect, validate(updateProfileSchema), updateProfile);
router.put('/change-password', protect, validate(changePasswordSchema), changePassword);

module.exports = router;
