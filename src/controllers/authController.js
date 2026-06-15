const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logActivity } = require('../services/activityService');
const { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } = require('../utils/errors');

/**
 * Generate a JWT token signed with JWT_SECRET
 */
const generateToken = (userId, email) => {
  return jwt.sign(
    { id: userId, email },
    process.env.JWT_SECRET || 'super_secret_dev_key_for_studentvault_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return next(new ConflictError('An account with this email address already exists.'));
    }

    // Hash the password securely
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Insert user record into DB
    const user = await User.create({
      name,
      email,
      password_hash: passwordHash
    });

    const userId = user.id;
    const token = generateToken(userId, email);

    // Log the user's initial login (auto-login upon successful registration)
    await logActivity(userId, 'Login', { method: 'registration' }, req.ip);

    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: {
          id: userId,
          name,
          email,
          profile_image: null
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log in an existing user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Fetch user details
    const user = await User.findOne({ email });
    if (!user) {
      return next(new UnauthorizedError('Invalid email or password.'));
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return next(new UnauthorizedError('Invalid email or password.'));
    }

    const token = generateToken(user.id, user.email);

    // Log action to activity ledger
    await logActivity(user.id, 'Login', { method: 'credentials' }, req.ip);

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          profile_image: user.profile_image
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Log out user (State-clear and audit)
 */
const logout = async (req, res, next) => {
  try {
    // Audit logs of logout event (if request is authenticated)
    if (req.user) {
      await logActivity(req.user.id, 'Logout', {}, req.ip);
    }

    res.status(200).json({
      status: 'success',
      message: 'Successfully logged out on server side.'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user profile
 */
const getProfile = async (req, res, next) => {
  try {
    // User object already retrieved in protect middleware
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update authenticated user profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { name, profile_image } = req.body;
    const userId = req.user.id;

    const updateData = {};

    if (name !== undefined) {
      updateData.name = name;
    }

    if (profile_image !== undefined) {
      updateData.profile_image = profile_image;
    }

    if (Object.keys(updateData).length === 0) {
      return next(new BadRequestError('No profile properties provided for modification.'));
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          profile_image: updatedUser.profile_image
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Securely rotation / update password
 */
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Fetch password hash from database
    const user = await User.findById(userId);
    if (!user) {
      return next(new NotFoundError('User record not found.'));
    }

    const hash = user.password_hash;

    // Verify existing password matches
    const isMatch = await bcrypt.compare(oldPassword, hash);
    if (!isMatch) {
      return next(new BadRequestError('Existing password provided is incorrect.'));
    }

    // Encrypt the new password
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    // Update in DB
    user.password_hash = newHash;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Password rotated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword
};
