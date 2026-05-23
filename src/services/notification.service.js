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

module.exports = { createNotification, ADMIN_ROOM }
