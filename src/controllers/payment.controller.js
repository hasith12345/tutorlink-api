const Stripe = require("stripe");
const { prisma } = require("../models");
const { createNotification } = require("../services/notification.service");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/payments/create-intent
exports.createPaymentIntent = async (req, res) => {
  try {
    const { classId } = req.body;
    if (!classId) return res.status(400).json({ message: "classId is required" });

    // Resolve student profile
    const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required to enroll" });

    // Load class with tutor info
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { tutor: { include: { user: { select: { fullName: true } } } } },
    });
    if (!cls) return res.status(404).json({ message: "Class not found" });
    if (cls.status !== "ACTIVE") return res.status(400).json({ message: "Class is not active" });
    if (cls.enrolledCount >= cls.maxStudents) return res.status(400).json({ message: "Class is full" });

    // Check for duplicate enrollment
    const existing = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: student.id, classId } },
    });
    if (existing) return res.status(400).json({ message: "Already enrolled in this class" });

    // Create Stripe PaymentIntent (amount in smallest currency unit — LKR has no subunit, multiply by 100 per Stripe requirement)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: cls.fees * 100,
      currency: "lkr",
      metadata: { classId, studentId: student.id },
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      classDetails: {
        subject: cls.subject,
        description: cls.description,
        fees: cls.fees,
        schedule: cls.schedule,
        time: cls.time,
        duration: cls.duration,
        mode: cls.mode,
        tutorName: cls.tutor.user.fullName,
        maxStudents: cls.maxStudents,
        enrolledCount: cls.enrolledCount,
      },
    });
  } catch (err) {
    console.error("createPaymentIntent error:", err);
    return res.status(500).json({ message: "Failed to create payment intent" });
  }
};

// POST /api/payments/confirm
exports.confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, classId } = req.body;
    if (!paymentIntentId || !classId)
      return res.status(400).json({ message: "paymentIntentId and classId are required" });

    const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required" });

    // Verify payment with Stripe
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded")
      return res.status(400).json({ message: `Payment not completed (status: ${intent.status})` });

    const cls = await prisma.class.findUnique({
      where: { id: classId },
      include: { tutor: true },
    });
    if (!cls) return res.status(404).json({ message: "Class not found" });

    // Prevent duplicate
    const existing = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: student.id, classId } },
    });
    if (existing) return res.status(400).json({ message: "Already enrolled" });

    const tutorAmount = Math.round(cls.fees * 0.92);
    const platformAmount = cls.fees - tutorAmount;

    // Create enrollment + payment + update counters atomically
    const [enrollment] = await prisma.$transaction([
      prisma.enrollment.create({
        data: {
          studentId: student.id,
          classId,
          status: "ACTIVE",
          payment: {
            create: {
              stripePaymentId: paymentIntentId,
              totalAmount: cls.fees,
              tutorAmount,
              platformAmount,
              currency: "lkr",
              status: "COMPLETED",
              paidAt: new Date(),
            },
          },
        },
        include: { payment: true },
      }),
      prisma.class.update({
        where: { id: classId },
        data: { enrolledCount: { increment: 1 } },
      }),
      prisma.tutor.update({
        where: { id: cls.tutorId },
        data: { totalStudents: { increment: 1 } },
      }),
    ]);

    console.log(`[PAYMENT] Enrollment success — studentUserId=${req.user.id} tutorUserId=${cls.tutor.userId} class=${cls.subject}`)

    // Fetch student name for tutor/admin notifications
    const studentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { fullName: true },
    });
    const studentName = studentUser?.fullName || "A student";

    // Fire notifications — wrapped individually so one failure doesn't block others
    try {
      // 1. Notify student — successfully enrolled
      await createNotification({
        userId: req.user.id,
        type: "ENROLLMENT_CONFIRMED",
        title: "Enrollment Confirmed",
        message: `You have successfully enrolled in ${cls.subject}. Payment of Rs.${cls.fees.toLocaleString()} received.`,
      });
    } catch (e) {
      console.error('[PAYMENT] Student notification failed:', e.message)
    }

    try {
      // 2. Notify tutor — payment received
      await createNotification({
        userId: cls.tutor.userId,
        type: "PAYMENT_RECEIVED",
        title: "Payment Received",
        message: `${studentName} enrolled in your ${cls.subject} class. Rs.${tutorAmount.toLocaleString()} credited to your earnings.`,
      });
    } catch (e) {
      console.error('[PAYMENT] Tutor notification failed:', e.message)
    }

    try {
      // 3. Notify admin — payment received (userId = null for admin)
      await createNotification({
        userId: null,
        type: "ADMIN_PAYMENT_RECEIVED",
        title: "Payment Received",
        message: `${studentName} enrolled in ${cls.subject}. Rs.${cls.fees.toLocaleString()} processed (platform fee: Rs.${platformAmount.toLocaleString()}).`,
      });
    } catch (e) {
      console.error('[PAYMENT] Admin notification failed:', e.message)
    }

    return res.json({
      enrollmentId: enrollment.id,
      tutorAmount,
      platformAmount,
      totalAmount: cls.fees,
    });
  } catch (err) {
    console.error("confirmPayment error:", err);
    return res.status(500).json({ message: "Failed to confirm payment" });
  }
};

// GET /api/payments/admin
exports.getAdminPayments = async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        enrollment: {
          include: {
            student: { include: { user: { select: { fullName: true, email: true } } } },
            class: {
              include: {
                tutor: { include: { user: { select: { fullName: true } } } },
              },
            },
          },
        },
      },
    });

    const totalRevenue = payments.reduce((s, p) => s + p.totalAmount, 0);
    const totalPlatform = payments.reduce((s, p) => s + p.platformAmount, 0);
    const totalTutor = payments.reduce((s, p) => s + p.tutorAmount, 0);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = payments
      .filter((p) => new Date(p.createdAt) >= startOfMonth)
      .reduce((s, p) => s + p.totalAmount, 0);

    return res.json({
      summary: {
        totalRevenue,
        totalPlatform,
        totalTutor,
        thisMonth,
        count: payments.length,
      },
      payments: payments.map((p) => ({
        id: p.id,
        stripePaymentId: p.stripePaymentId,
        totalAmount: p.totalAmount,
        tutorAmount: p.tutorAmount,
        platformAmount: p.platformAmount,
        currency: p.currency,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        studentName: p.enrollment.student.user.fullName,
        studentEmail: p.enrollment.student.user.email,
        tutorName: p.enrollment.class.tutor.user.fullName,
        className: p.enrollment.class.subject,
        classMode: p.enrollment.class.mode,
      })),
    });
  } catch (err) {
    console.error("getAdminPayments error:", err);
    return res.status(500).json({ message: "Failed to fetch payments" });
  }
};

// GET /api/payments/student/enrollments
exports.getStudentEnrollments = async (req, res) => {
  try {
    const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required" });

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: student.id, status: "ACTIVE" },
      orderBy: { enrolledAt: "desc" },
      include: {
        class: {
          include: {
            tutor: {
              include: { user: { select: { fullName: true, email: true } } },
            },
          },
        },
        payment: { select: { totalAmount: true, status: true, paidAt: true } },
      },
    });

    return res.json({
      enrollments: enrollments.map((e) => ({
        enrollmentId: e.id,
        enrolledAt: e.enrolledAt,
        status: e.status,
        class: {
          id: e.class.id,
          subject: e.class.subject,
          description: e.class.description,
          mode: e.class.mode,
          schedule: e.class.schedule,
          time: e.class.time,
          duration: e.class.duration,
          fees: e.class.fees,
          venue: e.class.venue,
          meetingLink: e.class.meetingLink,
          tutorId: e.class.tutorId,
          tutorName: e.class.tutor.user.fullName,
          tutorAvatar: e.class.tutor.avatar,
        },
        payment: e.payment
          ? { totalAmount: e.payment.totalAmount, status: e.payment.status, paidAt: e.payment.paidAt }
          : null,
      })),
    });
  } catch (err) {
    console.error("getStudentEnrollments error:", err);
    return res.status(500).json({ message: "Failed to fetch enrollments" });
  }
};

// GET /api/payments/tutor/earnings
exports.getTutorEarnings = async (req, res) => {
  try {
    const tutor = await prisma.tutor.findFirst({ where: { userId: req.user.id } });
    if (!tutor) return res.status(403).json({ message: "Tutor profile required" });

    const payments = await prisma.payment.findMany({
      where: {
        status: "COMPLETED",
        enrollment: { class: { tutorId: tutor.id } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        enrollment: {
          include: {
            student: { include: { user: { select: { fullName: true } } } },
            class: { select: { subject: true, schedule: true, mode: true } },
          },
        },
      },
    });

    const totalEarned = payments.reduce((s, p) => s + p.tutorAmount, 0);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonth = payments
      .filter((p) => new Date(p.createdAt) >= startOfMonth)
      .reduce((s, p) => s + p.tutorAmount, 0);

    return res.json({
      summary: { totalEarned, thisMonth, count: payments.length },
      payments: payments.map((p) => ({
        id: p.id,
        totalAmount: p.totalAmount,
        tutorAmount: p.tutorAmount,
        platformAmount: p.platformAmount,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
        studentName: p.enrollment.student.user.fullName,
        className: p.enrollment.class.subject,
        classSchedule: p.enrollment.class.schedule,
        classMode: p.enrollment.class.mode,
      })),
    });
  } catch (err) {
    console.error("getTutorEarnings error:", err);
    return res.status(500).json({ message: "Failed to fetch earnings" });
  }
};

// GET /api/payments/tutor/students
exports.getTutorStudents = async (req, res) => {
  try {
    const tutor = await prisma.tutor.findFirst({ where: { userId: req.user.id } });
    if (!tutor) return res.status(403).json({ message: "Tutor profile required" });

    const enrollments = await prisma.enrollment.findMany({
      where: {
        status: "ACTIVE",
        class: { tutorId: tutor.id },
      },
      orderBy: { enrolledAt: "desc" },
      include: {
        student: {
          include: { user: { select: { fullName: true, email: true } } },
        },
        class: {
          select: { id: true, subject: true, description: true, schedule: true, mode: true, fees: true, time: true },
        },
        payment: { select: { totalAmount: true, status: true, paidAt: true } },
      },
    });

    // Deduplicate by student — each student may be enrolled in multiple classes
    const studentsMap = new Map();
    for (const e of enrollments) {
      const sid = e.student.id;
      if (!studentsMap.has(sid)) {
        studentsMap.set(sid, {
          id: sid,
          fullName: e.student.user.fullName,
          email: e.student.user.email,
          avatar: e.student.avatar || null,
          enrolledClasses: [],
          enrolledAt: e.enrolledAt,
        });
      }
      studentsMap.get(sid).enrolledClasses.push({
        enrollmentId: e.id,
        classId: e.class.id,
        subject: e.class.subject,
        description: e.class.description || null,
        schedule: e.class.schedule,
        mode: e.class.mode,
        fees: e.class.fees,
        time: e.class.time,
        enrolledAt: e.enrolledAt,
        payment: e.payment,
      });
    }

    return res.json({
      students: Array.from(studentsMap.values()),
      totalStudents: studentsMap.size,
      totalEnrollments: enrollments.length,
    });
  } catch (err) {
    console.error("getTutorStudents error:", err);
    return res.status(500).json({ message: "Failed to fetch students" });
  }
};
