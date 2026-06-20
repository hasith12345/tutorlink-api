const { prisma } = require('../models')
const { getIO } = require('../config/socket')

const ADMIN_ROOM = 'admin'

async function createNotification({ userId, type, title, message }) {
  console.log(`[NOTIF] Creating: userId=${userId || 'ADMIN(null)'} type=${type} title="${title}"`)
  try {
    const notification = await prisma.notification.create({
      data: { userId: userId || null, type, title, message },
    })
    console.log(`[NOTIF] DB row created: id=${notification.id}`)

    const io = getIO()
    if (!io) {
      console.warn('[NOTIF] Socket.io NOT initialized — skipping live emit')
    } else {
      const payload = {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        createdAt: notification.createdAt,
      }
      const room = userId || ADMIN_ROOM
      io.to(room).emit('notification', payload)
      console.log(`[NOTIF] Emitted to room "${room}"`)
    }

    return notification
  } catch (err) {
    console.error('[NOTIF] FAILED to create notification:', err)
    throw err
  }
}

async function getUserNotifications(userId) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
}

async function getUserUnreadCount(userId) {
  return prisma.notification.count({ where: { userId, read: false } })
}

async function markAsRead(userId, id) {
  return prisma.notification.updateMany({ where: { id, userId }, data: { read: true } })
}

async function markAllAsRead(userId) {
  return prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } })
}

async function deleteNotification(userId, id) {
  return prisma.notification.deleteMany({ where: { id, userId } })
}

async function getAdminNotifications() {
  return prisma.notification.findMany({ where: { userId: null }, orderBy: { createdAt: 'desc' } })
}

async function getAdminUnreadCount() {
  return prisma.notification.count({ where: { userId: null, read: false } })
}

async function markAdminAsRead(id) {
  return prisma.notification.updateMany({ where: { id, userId: null }, data: { read: true } })
}

async function markAllAdminAsRead() {
  return prisma.notification.updateMany({ where: { userId: null, read: false }, data: { read: true } })
}

async function deleteAdminNotification(id) {
  return prisma.notification.deleteMany({ where: { id, userId: null } })
}

module.exports = {
  createNotification,
  ADMIN_ROOM,
  getUserNotifications,
  getUserUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getAdminNotifications,
  getAdminUnreadCount,
  markAdminAsRead,
  markAllAdminAsRead,
  deleteAdminNotification,
}
