const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middlewares/auth');

// All admin routes require ADMIN role
const adminOnly = [authenticate, authorize(['ADMIN'])];

// Dashboard
router.get('/dashboard', adminOnly, adminController.getDashboardStats);

// User Management
router.get('/users', adminOnly, adminController.getUsers);
router.patch('/users/:id/suspend', adminOnly, adminController.suspendUser);
router.patch('/users/:id/unsuspend', adminOnly, adminController.unsuspendUser);

// Auction Moderation
router.get('/auctions', adminOnly, adminController.getAuctions);
router.patch('/auctions/:id/cancel', adminOnly, adminController.cancelAuction);

// Audit Logs
router.get('/audit-logs', adminOnly, adminController.getAuditLogs);

module.exports = router;
