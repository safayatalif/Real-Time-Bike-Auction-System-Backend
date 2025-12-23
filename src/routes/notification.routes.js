const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate } = require('../middlewares/auth');

// All notification routes require authentication
router.get('/', authenticate, notificationController.getUserNotifications);
router.patch('/:id/read', authenticate, notificationController.markAsRead);
router.patch('/mark-all-read', authenticate, notificationController.markAllAsRead);
router.delete('/:id', authenticate, notificationController.deleteNotification);

module.exports = router;
