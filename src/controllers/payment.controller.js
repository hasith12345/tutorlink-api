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

    // If the student is already enrolled, allow paying only when the period has ended (renewal).
    // Otherwise refuse so they don't double-pay an already-active period.
    const existing = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: student.id, classId } },
      include: { payment: true },
    });
    if (existing) {
      if (existing.status !== "ACTIVE") {
        return res.status(400).json({ message: "Enrollment is not active. Please re-enroll instead." });
      }
      const paidAt = existing.payment?.paidAt ? new Date(existing.payment.paidAt) : new Date(existing.enrolledAt);
      const enrolledAt = new Date(existing.enrolledAt);
      const periodStart = paidAt < enrolledAt ? paidAt : enrolledAt;
      const nextPaymentDue = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
      if (new Date() < nextPaymentDue) {
        return res.status(400).json({ message: "Your current month is already paid. Try again after the period ends." });
      }
      // Overdue → renewal is allowed; the seat check below should be skipped
    } else {
      if (cls.enrolledCount >= cls.maxStudents) return res.status(400).json({ message: "Class is full" });
    }

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

    const existing = await prisma.enrollment.findUnique({
      where: { studentId_classId: { studentId: student.id, classId } },
      include: { payment: true },
    });

    const tutorAmount = Math.round(cls.fees * 0.92);
    const platformAmount = cls.fees - tutorAmount;

    let enrollment;
    let isRenewal = false;

    if (existing) {
      // Renewal — update the existing payment record and reset payment-due tracking
      isRenewal = true;
      enrollment = await prisma.enrollment.update({
        where: { id: existing.id },
        data: {
          lastPaymentDueNotifiedAt: null,
          payment: {
            update: {
              stripePaymentId: paymentIntentId,
              totalAmount: cls.fees,
              tutorAmount,
              platformAmount,
              status: "COMPLETED",
              paidAt: new Date(),
            },
          },
        },
        include: { payment: true },
      });
    } else {
      // New enrollment + payment + counter bumps
      const [created] = await prisma.$transaction([
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
      enrollment = created;
    }

    console.log(`[PAYMENT] Enrollment success — studentUserId=${req.user.id} tutorUserId=${cls.tutor.userId} class=${cls.subject}`)

    // Fetch student name for tutor/admin notifications
    const studentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { fullName: true },
    });
    const studentName = studentUser?.fullName || "A student";

    // Fire notifications — wrapped individually so one failure doesn't block others
    try {
      // 1. Notify student — successfully enrolled / renewed
      await createNotification({
        userId: req.user.id,
        type: isRenewal ? "PAYMENT_RENEWED" : "ENROLLMENT_CONFIRMED",
        title: isRenewal ? "Payment Renewed" : "Enrollment Confirmed",
        message: isRenewal
          ? `Your monthly payment for ${cls.subject} has been renewed. Access restored.`
          : `You have successfully enrolled in ${cls.subject}. Payment of Rs.${cls.fees.toLocaleString()} received.`,
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
        message: isRenewal
          ? `${studentName} renewed payment for your ${cls.subject} class. Rs.${tutorAmount.toLocaleString()} credited to your earnings.`
          : `${studentName} enrolled in your ${cls.subject} class. Rs.${tutorAmount.toLocaleString()} credited to your earnings.`,
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
        message: isRenewal
          ? `${studentName} renewed payment for ${cls.subject}. Rs.${cls.fees.toLocaleString()} processed (platform fee: Rs.${platformAmount.toLocaleString()}).`
          : `${studentName} enrolled in ${cls.subject}. Rs.${cls.fees.toLocaleString()} processed (platform fee: Rs.${platformAmount.toLocaleString()}).`,
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

    const now = new Date();
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: student.id,
        OR: [
          { status: "ACTIVE" },
          { status: "UNENROLLED", accessUntil: { gt: now } },
        ],
      },
      orderBy: { enrolledAt: "desc" },
      include: {
        class: {
          include: {
            tutor: {
              include: {
                user: {
                  select: {
                    fullName: true,
                    email: true,
                    student: { select: { avatar: true } },
                  },
                },
              },
            },
          },
        },
        payment: { select: { totalAmount: true, status: true, paidAt: true } },
      },
    });

    // Compute payment-due status and notify once per overdue period
    const studentUser = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true } });

    const enrollmentsWithDueInfo = await Promise.all(
      enrollments.map(async (e) => {
        let isPaymentDue = false;
        let accessBlocked = false;
        let nextPaymentDue = null;
        let accessExpiresAt = null;

        if (e.status === "ACTIVE" && e.payment?.paidAt) {
          // Period = calendar month of payment. Take the earlier of paidAt / enrolledAt
          // so backdating either field triggers correctly for testing.
          const paidAt = new Date(e.payment.paidAt);
          const enrolledAt = new Date(e.enrolledAt);
          const periodStart = paidAt < enrolledAt ? paidAt : enrolledAt;

          // First day of the month AFTER the paid period — that's when the next payment is due.
          nextPaymentDue = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);

          // 15-day grace period from `nextPaymentDue` (so 15th of the next month, end-of-day).
          accessExpiresAt = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 15, 23, 59, 59);

          if (now >= nextPaymentDue) {
            isPaymentDue = true;
            accessBlocked = now > accessExpiresAt;

            if (studentUser) {
              // Atomic claim — only ONE parallel request will get count > 0 and send the notification.
              // The condition matches rows that haven't been notified for THIS period yet.
              const claim = await prisma.enrollment.updateMany({
                where: {
                  id: e.id,
                  OR: [
                    { lastPaymentDueNotifiedAt: null },
                    { lastPaymentDueNotifiedAt: { lt: nextPaymentDue } },
                  ],
                },
                data: { lastPaymentDueNotifiedAt: now },
              }).catch(() => ({ count: 0 }));

              if (claim.count > 0) {
                createNotification({
                  userId: studentUser.id,
                  type: "PAYMENT_DUE",
                  title: "Payment due",
                  message: `Your monthly payment for "${e.class.subject}" is due. You have until ${accessExpiresAt.toDateString()} to renew before access is blocked.`,
                }).catch(() => {});
              }
            }
          }
        }

        return { ...e, isPaymentDue, accessBlocked, nextPaymentDue, accessExpiresAt };
      })
    );

    return res.json({
      enrollments: enrollmentsWithDueInfo.map((e) => ({
        enrollmentId: e.id,
        enrolledAt: e.enrolledAt,
        status: e.status,
        unenrolledAt: e.unenrolledAt,
        accessUntil: e.accessUntil,
        isPaymentDue: e.isPaymentDue,
        accessBlocked: e.accessBlocked,
        nextPaymentDue: e.nextPaymentDue,
        accessExpiresAt: e.accessExpiresAt,
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
          tutorAvatar: e.class.tutor.avatar || e.class.tutor.user.student?.avatar || null,
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

// POST /api/payments/student/enrollments/:id/unenroll
// Student opts out — keeps access until the monthly period ends
exports.unenrollFromClass = async (req, res) => {
  try {
    const enrollmentId = req.params.id;
    const student = await prisma.student.findFirst({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required" });

    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        payment: true,
        class: { include: { tutor: { select: { userId: true } } } },
      },
    });

    if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
    if (enrollment.studentId !== student.id) return res.status(403).json({ message: "Access denied" });
    if (enrollment.status !== "ACTIVE") {
      return res.status(400).json({ message: "Enrollment is not active" });
    }

    // Access ends 30 days after the last payment (the monthly period they paid for).
    // Fall back to 30 days from enrolledAt if no payment date is available.
    const baseDate = enrollment.payment?.paidAt || enrollment.enrolledAt;
    const accessUntil = new Date(baseDate);
    accessUntil.setDate(accessUntil.getDate() + 30);

    const [updated] = await prisma.$transaction([
      prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { status: "UNENROLLED", unenrolledAt: new Date(), accessUntil },
      }),
      prisma.class.update({
        where: { id: enrollment.classId },
        data: { enrolledCount: { decrement: 1 } },
      }),
      prisma.tutor.update({
        where: { id: enrollment.class.tutorId },
        data: { totalStudents: { decrement: 1 } },
      }),
    ]);

    // Notify the tutor
    createNotification({
      userId: enrollment.class.tutor.userId,
      type: "STUDENT_UNENROLLED",
      title: "A student has unenrolled",
      message: `A student opted out of "${enrollment.class.subject}". They will retain access until ${accessUntil.toDateString()}.`,
    }).catch(() => {});

    return res.json({
      message: "Unenrolled successfully. Access remains until the end of your paid period.",
      enrollment: {
        id: updated.id,
        status: updated.status,
        unenrolledAt: updated.unenrolledAt,
        accessUntil: updated.accessUntil,
      },
    });
  } catch (err) {
    console.error("unenrollFromClass error:", err);
    return res.status(500).json({ message: "Failed to unenroll" });
  }
};
