const express = require('express')
const router = express.Router()
const authMiddleware = require('../middleware/auth.middleware')
const {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getAdminNotifications,
  getAdminUnreadCount,
  markAdminAsRead,
  markAllAdminAsRead,
  deleteAdminNotification,
} = require('../controllers/notification.controller')

// Admin routes (must come before /:id to avoid route conflicts)
router.get('/admin', authMiddleware, getAdminNotifications)
router.get('/admin/unread-count', authMiddleware, getAdminUnreadCount)
router.put('/admin/read-all', authMiddleware, markAllAdminAsRead)
router.put('/admin/:id/read', authMiddleware, markAdminAsRead)
router.delete('/admin/:id', authMiddleware, deleteAdminNotification)

// User routes
router.get('/', authMiddleware, getNotifications)
router.get('/unread-count', authMiddleware, getUnreadCount)
router.put('/read-all', authMiddleware, markAllAsRead)
router.put('/:id/read', authMiddleware, markAsRead)
router.delete('/:id', authMiddleware, deleteNotification)

module.exports = router
