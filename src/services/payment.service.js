const Stripe = require('stripe');
const { prisma } = require('../models');
const { createNotification } = require('./notification.service');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function appError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

async function createPaymentIntent(userId, classId) {
  if (!classId) throw appError('classId is required', 400);

  const student = await prisma.student.findFirst({ where: { userId } });
  if (!student) throw appError('Student profile required to enroll', 403);

  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { tutor: { include: { user: { select: { fullName: true } } } } },
  });
  if (!cls) throw appError('Class not found', 404);
  if (cls.status !== 'ACTIVE') throw appError('Class is not active', 400);

  const existing = await prisma.enrollment.findUnique({
    where: { studentId_classId: { studentId: student.id, classId } },
    include: { payment: true },
  });

  if (existing) {
    if (existing.status !== 'ACTIVE') throw appError('Enrollment is not active. Please re-enroll instead.', 400);
    const paidAt = existing.payment?.paidAt ? new Date(existing.payment.paidAt) : new Date(existing.enrolledAt);
    const enrolledAt = new Date(existing.enrolledAt);
    const periodStart = paidAt < enrolledAt ? paidAt : enrolledAt;
    const nextPaymentDue = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
    if (new Date() < nextPaymentDue) {
      throw appError('Your current month is already paid. Try again after the period ends.', 400);
    }
  } else {
    if (cls.enrolledCount >= cls.maxStudents) throw appError('Class is full', 400);
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: cls.fees * 100,
    currency: 'lkr',
    metadata: { classId, studentId: student.id },
  });

  return {
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
  };
}

async function confirmPayment(userId, paymentIntentId, classId) {
  if (!paymentIntentId || !classId) throw appError('paymentIntentId and classId are required', 400);

  const student = await prisma.student.findFirst({ where: { userId } });
  if (!student) throw appError('Student profile required', 403);

  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== 'succeeded') throw appError(`Payment not completed (status: ${intent.status})`, 400);

  const cls = await prisma.class.findUnique({ where: { id: classId }, include: { tutor: true } });
  if (!cls) throw appError('Class not found', 404);

  const existing = await prisma.enrollment.findUnique({
    where: { studentId_classId: { studentId: student.id, classId } },
    include: { payment: true },
  });

  const tutorAmount = Math.round(cls.fees * 0.92);
  const platformAmount = cls.fees - tutorAmount;
  let enrollment;
  let isRenewal = false;

  if (existing) {
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
            status: 'COMPLETED',
            paidAt: new Date(),
          },
        },
      },
      include: { payment: true },
    });
  } else {
    const [created] = await prisma.$transaction([
      prisma.enrollment.create({
        data: {
          studentId: student.id,
          classId,
          status: 'ACTIVE',
          payment: {
            create: {
              stripePaymentId: paymentIntentId,
              totalAmount: cls.fees,
              tutorAmount,
              platformAmount,
              currency: 'lkr',
              status: 'COMPLETED',
              paidAt: new Date(),
            },
          },
        },
        include: { payment: true },
      }),
      prisma.class.update({ where: { id: classId }, data: { enrolledCount: { increment: 1 } } }),
      prisma.tutor.update({ where: { id: cls.tutorId }, data: { totalStudents: { increment: 1 } } }),
    ]);
    enrollment = created;
  }

  console.log(`[PAYMENT] Enrollment success — studentUserId=${userId} tutorUserId=${cls.tutor.userId} class=${cls.subject}`);

  const studentUser = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  const studentName = studentUser?.fullName || 'A student';

  createNotification({
    userId,
    type: isRenewal ? 'PAYMENT_RENEWED' : 'ENROLLMENT_CONFIRMED',
    title: isRenewal ? 'Payment Renewed' : 'Enrollment Confirmed',
    message: isRenewal
      ? `Your monthly payment for ${cls.subject} has been renewed. Access restored.`
      : `You have successfully enrolled in ${cls.subject}. Your learning journey starts now!`,
  }).catch((e) => console.error('[PAYMENT] Student notification failed:', e.message));

  createNotification({
    userId: cls.tutor.userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment Received',
    message: isRenewal
      ? `${studentName} renewed payment for your ${cls.subject} class. Rs.${tutorAmount.toLocaleString()} credited to your earnings.`
      : `${studentName} enrolled in your ${cls.subject} class. Rs.${tutorAmount.toLocaleString()} credited to your earnings.`,
  }).catch((e) => console.error('[PAYMENT] Tutor notification failed:', e.message));

  createNotification({
    userId: null,
    type: 'ADMIN_PAYMENT_RECEIVED',
    title: 'Payment Received',
    message: isRenewal
      ? `${studentName} renewed payment for ${cls.subject}. Rs.${cls.fees.toLocaleString()} processed (platform fee: Rs.${platformAmount.toLocaleString()}).`
      : `${studentName} enrolled in ${cls.subject}. Rs.${cls.fees.toLocaleString()} processed (platform fee: Rs.${platformAmount.toLocaleString()}).`,
  }).catch((e) => console.error('[PAYMENT] Admin notification failed:', e.message));

  return { enrollmentId: enrollment.id, tutorAmount, platformAmount, totalAmount: cls.fees };
}

async function getAdminPayments() {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      enrollment: {
        include: {
          student: { include: { user: { select: { fullName: true, email: true } } } },
          class: { include: { tutor: { include: { user: { select: { fullName: true } } } } } },
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

  return {
    summary: { totalRevenue, totalPlatform, totalTutor, thisMonth, count: payments.length },
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
  };
}

async function getStudentEnrollments(userId) {
  const student = await prisma.student.findFirst({ where: { userId } });
  if (!student) throw appError('Student profile required', 403);

  const now = new Date();
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: student.id,
      OR: [{ status: 'ACTIVE' }, { status: 'UNENROLLED', accessUntil: { gt: now } }],
    },
    orderBy: { enrolledAt: 'desc' },
    include: {
      class: {
        include: {
          tutor: {
            include: {
              user: { select: { fullName: true, email: true, student: { select: { avatar: true } } } },
            },
          },
        },
      },
      payment: { select: { totalAmount: true, status: true, paidAt: true } },
    },
  });

  const studentUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

  const enriched = await Promise.all(
    enrollments.map(async (e) => {
      let isPaymentDue = false;
      let accessBlocked = false;
      let nextPaymentDue = null;
      let accessExpiresAt = null;

      if (e.status === 'ACTIVE' && e.payment?.paidAt) {
        const paidAt = new Date(e.payment.paidAt);
        const enrolledAt = new Date(e.enrolledAt);
        const periodStart = paidAt < enrolledAt ? paidAt : enrolledAt;
        nextPaymentDue = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
        accessExpiresAt = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 15, 23, 59, 59);

        if (now >= nextPaymentDue) {
          isPaymentDue = true;
          accessBlocked = now > accessExpiresAt;

          if (studentUser) {
            const claim = await prisma.enrollment
              .updateMany({
                where: {
                  id: e.id,
                  OR: [{ lastPaymentDueNotifiedAt: null }, { lastPaymentDueNotifiedAt: { lt: nextPaymentDue } }],
                },
                data: { lastPaymentDueNotifiedAt: now },
              })
              .catch(() => ({ count: 0 }));

            if (claim.count > 0) {
              createNotification({
                userId: studentUser.id,
                type: 'PAYMENT_DUE',
                title: 'Payment due',
                message: `Your monthly payment for "${e.class.subject}" is due. You have until ${accessExpiresAt.toDateString()} to renew before access is blocked.`,
              }).catch(() => {});
            }
          }
        }
      }

      return { ...e, isPaymentDue, accessBlocked, nextPaymentDue, accessExpiresAt };
    })
  );

  return {
    enrollments: enriched.map((e) => ({
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
  };
}

async function getTutorEarnings(userId) {
  const tutor = await prisma.tutor.findFirst({ where: { userId } });
  if (!tutor) throw appError('Tutor profile required', 403);

  const payments = await prisma.payment.findMany({
    where: { status: 'COMPLETED', enrollment: { class: { tutorId: tutor.id } } },
    orderBy: { createdAt: 'desc' },
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

  return {
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
  };
}

async function getTutorStudents(userId) {
  const tutor = await prisma.tutor.findFirst({ where: { userId } });
  if (!tutor) throw appError('Tutor profile required', 403);

  const enrollments = await prisma.enrollment.findMany({
    where: { status: 'ACTIVE', class: { tutorId: tutor.id } },
    orderBy: { enrolledAt: 'desc' },
    include: {
      student: { include: { user: { select: { fullName: true, email: true } } } },
      class: { select: { id: true, subject: true, description: true, schedule: true, mode: true, fees: true, time: true } },
      payment: { select: { totalAmount: true, status: true, paidAt: true } },
    },
  });

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

  return {
    students: Array.from(studentsMap.values()),
    totalStudents: studentsMap.size,
    totalEnrollments: enrollments.length,
  };
}

async function unenrollFromClass(userId, enrollmentId) {
  const student = await prisma.student.findFirst({ where: { userId } });
  if (!student) throw appError('Student profile required', 403);

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      payment: true,
      class: { include: { tutor: { select: { userId: true } } } },
    },
  });

  if (!enrollment) throw appError('Enrollment not found', 404);
  if (enrollment.studentId !== student.id) throw appError('Access denied', 403);
  if (enrollment.status !== 'ACTIVE') throw appError('Enrollment is not active', 400);

  const baseDate = enrollment.payment?.paidAt || enrollment.enrolledAt;
  const accessUntil = new Date(baseDate);
  accessUntil.setDate(accessUntil.getDate() + 30);

  const [updated] = await prisma.$transaction([
    prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: 'UNENROLLED', unenrolledAt: new Date(), accessUntil },
    }),
    prisma.class.update({ where: { id: enrollment.classId }, data: { enrolledCount: { decrement: 1 } } }),
    prisma.tutor.update({ where: { id: enrollment.class.tutorId }, data: { totalStudents: { decrement: 1 } } }),
  ]);

  createNotification({
    userId: enrollment.class.tutor.userId,
    type: 'STUDENT_UNENROLLED',
    title: 'A student has unenrolled',
    message: `A student opted out of "${enrollment.class.subject}". They will retain access until ${accessUntil.toDateString()}.`,
  }).catch(() => {});

  return {
    message: 'Unenrolled successfully. Access remains until the end of your paid period.',
    enrollment: {
      id: updated.id,
      status: updated.status,
      unenrolledAt: updated.unenrolledAt,
      accessUntil: updated.accessUntil,
    },
  };
}

module.exports = {
  createPaymentIntent,
  confirmPayment,
  getAdminPayments,
  getStudentEnrollments,
  getTutorEarnings,
  getTutorStudents,
  unenrollFromClass,
};
