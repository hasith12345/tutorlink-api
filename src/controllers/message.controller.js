const { prisma } = require("../models");
const { getIO } = require("../config/socket");

// GET /api/messages/conversations
// Returns all conversations for the current user with last message + unread count
async function getConversations(req, res) {
  try {
    const userId = req.user.id;
    const role = req.query.role; // 'student' or 'tutor' — frontend tells us which inbox

    const student = role === "tutor" ? null : await prisma.student.findUnique({ where: { userId } });
    const tutor = role === "student" ? null : await prisma.tutor.findUnique({ where: { userId } });

    let conversations;

    if (student) {
      conversations = await prisma.conversation.findMany({
        where: { studentId: student.id },
        orderBy: { updatedAt: "desc" },
        include: {
          tutor: {
            select: {
              id: true,
              avatar: true,
              user: { select: { fullName: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      return res.json({
        conversations: conversations.map((c) => ({
          id: c.id,
          otherParty: {
            id: c.tutor.id,
            name: c.tutor.user.fullName,
            avatar: c.tutor.avatar,
            role: "tutor",
          },
          lastMessage: c.messages[0] ?? null,
          unreadCount: 0, // computed below
          updatedAt: c.updatedAt,
        })),
      });
    }

    if (tutor) {
      conversations = await prisma.conversation.findMany({
        where: { tutorId: tutor.id },
        orderBy: { updatedAt: "desc" },
        include: {
          student: {
            select: {
              id: true,
              avatar: true,
              user: { select: { fullName: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      });

      // Count unread messages (sent by the student, not read yet)
      const unreadCounts = await Promise.all(
        conversations.map((c) =>
          prisma.message.count({
            where: {
              conversationId: c.id,
              senderId: { not: userId },
              read: false,
            },
          })
        )
      );

      return res.json({
        conversations: conversations.map((c, i) => ({
          id: c.id,
          otherParty: {
            id: c.student.id,
            name: c.student.user.fullName,
            avatar: c.student.avatar,
            role: "student",
          },
          lastMessage: c.messages[0] ?? null,
          unreadCount: unreadCounts[i],
          updatedAt: c.updatedAt,
        })),
      });
    }

    res.json({ conversations: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
}

// POST /api/messages/conversations
// Creates or gets an existing conversation. A student initiates with a tutor
// (body: { tutorId }); a tutor initiates with an enrolled student (body: { studentId }).
async function createOrGetConversation(req, res) {
  try {
    const userId = req.user.id;
    const { tutorId, studentId } = req.body;

    // Tutor initiating a conversation with one of their enrolled students
    if (studentId) {
      const tutor = await prisma.tutor.findUnique({ where: { userId } });
      if (!tutor) return res.status(403).json({ message: "Only tutors can message students" });

      // Guard: the student must be actively enrolled in one of this tutor's classes
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentId,
          class: { tutorId: tutor.id },
          status: "ACTIVE",
        },
      });
      if (!enrollment) {
        return res.status(403).json({ message: "This student is not enrolled in your classes" });
      }

      const conversation = await prisma.conversation.upsert({
        where: { studentId_tutorId: { studentId, tutorId: tutor.id } },
        create: { studentId, tutorId: tutor.id },
        update: {},
        include: {
          student: {
            select: {
              id: true,
              avatar: true,
              user: { select: { fullName: true } },
            },
          },
        },
      });

      return res.json({
        conversation: {
          id: conversation.id,
          otherParty: {
            id: conversation.student.id,
            name: conversation.student.user.fullName,
            avatar: conversation.student.avatar,
            role: "student",
          },
          updatedAt: conversation.updatedAt,
        },
      });
    }

    if (!tutorId) return res.status(400).json({ message: "tutorId is required" });

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(403).json({ message: "Only students can initiate conversations" });

    // Guard: student must be actively enrolled with this tutor
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        class: { tutorId },
        status: "ACTIVE",
      },
    });
    if (!enrollment) {
      return res.status(403).json({ message: "You must be enrolled with this tutor to message them" });
    }

    const conversation = await prisma.conversation.upsert({
      where: { studentId_tutorId: { studentId: student.id, tutorId } },
      create: { studentId: student.id, tutorId },
      update: {},
      include: {
        tutor: {
          select: {
            id: true,
            avatar: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });

    res.json({
      conversation: {
        id: conversation.id,
        otherParty: {
          id: conversation.tutor.id,
          name: conversation.tutor.user.fullName,
          avatar: conversation.tutor.avatar,
          role: "tutor",
        },
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create conversation" });
  }
}

// GET /api/messages/conversations/:id
// Load messages for a conversation; marks received messages as read
async function getConversationMessages(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        student: { select: { userId: true, user: { select: { fullName: true } }, avatar: true } },
        tutor: { select: { userId: true, user: { select: { fullName: true } }, avatar: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: { select: { fullName: true } } },
        },
      },
    });

    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    const isStudent = conversation.student.userId === userId;
    const isTutor = conversation.tutor.userId === userId;
    if (!isStudent && !isTutor) return res.status(403).json({ message: "Access denied" });

    // Mark messages sent by the other party as read
    await prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: userId }, read: false },
      data: { read: true },
    });

    const otherParty = isStudent
      ? { id: conversation.tutor.id, name: conversation.tutor.user.fullName, avatar: conversation.tutor.avatar, role: "tutor" }
      : { id: conversation.student.id, name: conversation.student.user.fullName, avatar: conversation.student.avatar, role: "student" };

    res.json({
      conversation: {
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
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
}

// POST /api/messages/conversations/:id/messages
// Send a message; emits message:new to the recipient via Socket.io
async function sendMessage(req, res) {
  try {
    const userId = req.user.id;
    const { id: conversationId } = req.params;
    const { content } = req.body;

    if (!content?.trim()) return res.status(400).json({ message: "Message content is required" });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });

    if (!conversation) return res.status(404).json({ message: "Conversation not found" });

    const isStudent = conversation.student.userId === userId;
    const isTutor = conversation.tutor.userId === userId;
    if (!isStudent && !isTutor) return res.status(403).json({ message: "Access denied" });

    const recipientUserId = isStudent ? conversation.tutor.userId : conversation.student.userId;

    const message = await prisma.message.create({
      data: { conversationId, senderId: userId, content: content.trim() },
      include: { sender: { select: { fullName: true } } },
    });

    // Bump conversation updatedAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    const payload = {
      id: message.id,
      conversationId,
      content: message.content,
      senderId: message.senderId,
      senderName: message.sender.fullName,
      read: message.read,
      createdAt: message.createdAt,
      isMine: false, // recipient perspective
    };

    try {
      getIO().to(recipientUserId).emit("message:new", payload);
    } catch {}

    res.json({
      message: { ...payload, isMine: true },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send message" });
  }
}

// PUT /api/messages/conversations/:id/read
async function markConversationRead(req, res) {
  try {
    const userId = req.user.id;
    const { id: conversationId } = req.params;

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId },
      include: {
        student: { select: { userId: true } },
        tutor: { select: { userId: true } },
      },
    });

    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    if (conversation.student.userId !== userId && conversation.tutor.userId !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, read: false },
      data: { read: true },
    });

    res.json({ message: "Marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to mark as read" });
  }
}

module.exports = { getConversations, createOrGetConversation, getConversationMessages, sendMessage, markConversationRead };
