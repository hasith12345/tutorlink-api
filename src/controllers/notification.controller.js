const notificationService = require('../services/notification.service');

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.getUserNotifications(req.user.id);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await notificationService.getUserUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    await notificationService.markAsRead(req.user.id, req.params.id);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user.id);
    res.json({ message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
};

exports.deleteNotification = async (req, res, next) => {
  try {
    await notificationService.deleteNotification(req.user.id, req.params.id);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
};

exports.getAdminNotifications = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
    const notifications = await notificationService.getAdminNotifications();
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
};

exports.getAdminUnreadCount = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
    const count = await notificationService.getAdminUnreadCount();
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.markAdminAsRead = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
    await notificationService.markAdminAsRead(req.params.id);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
};

exports.markAllAdminAsRead = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
    await notificationService.markAllAdminAsRead();
    res.json({ message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
};

exports.deleteAdminNotification = async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ message: 'Admin only' });
    await notificationService.deleteAdminNotification(req.params.id);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    next(err);
  }
};
