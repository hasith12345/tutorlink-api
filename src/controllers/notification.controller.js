const { prisma } = require('../models')

// ============================================================
// USER endpoints (userId = req.user.id)
// ============================================================

exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ notifications })
  } catch (err) {
    next(err)
  }
}

exports.getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id
    const count = await prisma.notification.count({
      where: { userId, read: false },
    })
    res.json({ count })
  } catch (err) {
    next(err)
  }
}

exports.markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params
    await prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    })
    res.json({ message: 'Marked as read' })
  } catch (err) {
    next(err)
  }
}

exports.markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
    res.json({ message: 'All marked as read' })
  } catch (err) {
    next(err)
  }
}

exports.deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user.id
    const { id } = req.params
    await prisma.notification.deleteMany({ where: { id, userId } })
    res.json({ message: 'Notification deleted' })
  } catch (err) {
    next(err)
  }
}

// ============================================================
// ADMIN endpoints (userId IS NULL)
// ============================================================

exports.getAdminNotifications = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' })
    const notifications = await prisma.notification.findMany({
      where: { userId: null },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ notifications })
  } catch (err) {
    next(err)
  }
}

exports.getAdminUnreadCount = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' })
    const count = await prisma.notification.count({
      where: { userId: null, read: false },
    })
    res.json({ count })
  } catch (err) {
    next(err)
  }
}

exports.markAdminAsRead = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' })
    const { id } = req.params
    await prisma.notification.updateMany({
      where: { id, userId: null },
      data: { read: true },
    })
    res.json({ message: 'Marked as read' })
  } catch (err) {
    next(err)
  }
}

exports.markAllAdminAsRead = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' })
    await prisma.notification.updateMany({
      where: { userId: null, read: false },
      data: { read: true },
    })
    res.json({ message: 'All marked as read' })
  } catch (err) {
    next(err)
  }
}

exports.deleteAdminNotification = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' })
    const { id } = req.params
    await prisma.notification.deleteMany({ where: { id, userId: null } })
    res.json({ message: 'Notification deleted' })
  } catch (err) {
    next(err)
  }
}
