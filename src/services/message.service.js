const { prisma } = require('../models');
const { getIO } = require('../config/socket');

function appError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

async function getConversations(userId, role) {
  const student = role === 'tutor' ? null : await prisma.student.findUnique({ where: { userId } });
  const tutor = role === 'student' ? null : await prisma.tutor.findUnique({ where: { userId } });

  if (student) {
    const conversations = await prisma.conversation.findMany({
      where: { studentId: student.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        tutor: { select: { id: true, avatar: true, user: { select: { fullName: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      otherParty: { id: c.tutor.id, name: c.tutor.user.fullName, avatar: c.tutor.avatar, role: 'tutor' },
      lastMessage: c.messages[0] ?? null,
      unreadCount: 0,
      updatedAt: c.updatedAt,
    }));
  }

  if (tutor) {
    const conversations = await prisma.conversation.findMany({
      where: { tutorId: tutor.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        student: { select: { id: true, avatar: true, user: { select: { fullName: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const unreadCounts = await Promise.all(
      conversations.map((c) =>
        prisma.message.count({ where: { conversationId: c.id, senderId: { not: userId }, read: false } })
      )
    );

    return conversations.map((c, i) => ({
      id: c.id,
      otherParty: { id: c.student.id, name: c.student.user.fullName, avatar: c.student.avatar, role: 'student' },
      lastMessage: c.messages[0] ?? null,
      unreadCount: unreadCounts[i],
      updatedAt: c.updatedAt,
    }));
  }

  return [];
}

async function createOrGetConversation(userId, { tutorId, studentId }) {
  if (studentId) {
    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) throw appError('Only tutors can message students', 403);

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, class: { tutorId: tutor.id }, status: 'ACTIVE' },
    });
    if (!enrollment) throw appError('This student is not enrolled in your classes', 403);

    const conversation = await prisma.conversation.upsert({
      where: { studentId_tutorId: { studentId, tutorId: tutor.id } },
      create: { studentId, tutorId: tutor.id },
      update: {},
      include: {
        student: { select: { id: true, avatar: true, user: { select: { fullName: true } } } },
      },
    });

    return {
      id: conversation.id,
      otherParty: {
        id: conversation.student.id,
        name: conversation.student.user.fullName,
        avatar: conversation.student.avatar,
        role: 'student',
      },
      updatedAt: conversation.updatedAt,
    };
  }

  if (!tutorId) throw appError('tutorId is required', 400);

  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw appError('Only students can initiate conversations', 403);

  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id, class: { tutorId }, status: 'ACTIVE' },
  });
  if (!enrollment) throw appError('You must be enrolled with this tutor to message them', 403);

  const conversation = await prisma.conversation.upsert({
    where: { studentId_tutorId: { studentId: student.id, tutorId } },
    create: { studentId: student.id, tutorId },
    update: {},
    include: {
      tutor: { select: { id: true, avatar: true, user: { select: { fullName: true } } } },
    },
  });

  return {
    id: conversation.id,
    otherParty: {
      id: conversation.tutor.id,
      name: conversation.tutor.user.fullName,
      avatar: conversation.tutor.avatar,
      role: 'tutor',
    },
    updatedAt: conversation.updatedAt,
  };
}

async function getConversationMessages(userId, conversationId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      student: { select: { userId: true, user: { select: { fullName: true } }, avatar: true } },
      tutor: { select: { userId: true, user: { select: { fullName: true } }, avatar: true } },
      messages: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { fullName: true } } } },
    },
  });

  if (!conversation) throw appError('Conversation not found', 404);

  const isStudent = conversation.student.userId === userId;
  const isTutor = conversation.tutor.userId === userId;
  if (!isStudent && !isTutor) throw appError('Access denied', 403);

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, read: false },
    data: { read: true },
  });

  const otherParty = isStudent
    ? { id: conversation.tutor.id, name: conversation.tutor.user.fullName, avatar: conversation.tutor.avatar, role: 'tutor' }
    : { id: conversation.student.id, name: conversation.student.user.fullName, avatar: conversation.student.avatar, role: 'student' };

  return {
    id: conversation.id,
    otherParty,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      content: m.content,
      senderId: m.senderId,
      senderName: m.sender.fullName,
      read: m.read,
      createdAt: m.createdAt,
      isMine: m.senderId === userId,
    })),
  };
}

async function sendMessage(userId, conversationId, content) {
  if (!content?.trim()) throw appError('Message content is required', 400);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      student: { select: { userId: true } },
      tutor: { select: { userId: true } },
    },
  });

  if (!conversation) throw appError('Conversation not found', 404);

  const isStudent = conversation.student.userId === userId;
  const isTutor = conversation.tutor.userId === userId;
  if (!isStudent && !isTutor) throw appError('Access denied', 403);

  const recipientUserId = isStudent ? conversation.tutor.userId : conversation.student.userId;

  const message = await prisma.message.create({
    data: { conversationId, senderId: userId, content: content.trim() },
    include: { sender: { select: { fullName: true } } },
  });

  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  const payload = {
    id: message.id,
    conversationId,
    content: message.content,
    senderId: message.senderId,
    senderName: message.sender.fullName,
    read: message.read,
    createdAt: message.createdAt,
    isMine: false,
  };

  try {
    getIO().to(recipientUserId).emit('message:new', payload);
  } catch (_) {}

  return { ...payload, isMine: true };
}

async function markConversationRead(userId, conversationId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { student: { select: { userId: true } }, tutor: { select: { userId: true } } },
  });

  if (!conversation) throw appError('Conversation not found', 404);
  if (conversation.student.userId !== userId && conversation.tutor.userId !== userId) {
    throw appError('Access denied', 403);
  }

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, read: false },
    data: { read: true },
  });
}

module.exports = {
  getConversations,
  createOrGetConversation,
  getConversationMessages,
  sendMessage,
  markConversationRead,
};
