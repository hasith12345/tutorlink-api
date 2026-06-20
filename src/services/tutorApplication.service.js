const { prisma } = require('../models');
const { createNotification } = require('./notification.service');

function appError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

async function submitApplication(userId, { cvUrl, qualifications, subjects, experience }) {
  if (!qualifications) throw appError('Qualifications are required', 400);
  if (!subjects || (Array.isArray(subjects) && subjects.length === 0)) {
    throw appError('At least one subject is required', 400);
  }

  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found. Please sign up as a tutor first.', 404);

  const alreadyHasDetails = tutor.qualifications && tutor.subjects && tutor.subjects.length > 0;
  if (tutor.applicationStatus === 'PENDING' && alreadyHasDetails) {
    throw appError('Your application is already under review.', 400);
  }
  if (tutor.applicationStatus === 'APPROVED') throw appError('Your application has already been approved.', 400);

  const updated = await prisma.tutor.update({
    where: { userId },
    data: {
      cvUrl: cvUrl || null,
      qualifications,
      subjects: Array.isArray(subjects) ? subjects : [subjects],
      experience: experience || null,
      applicationStatus: 'PENDING',
    },
  });

  return { tutorStatus: updated.applicationStatus };
}

async function getApplicationStatus(userId) {
  const tutor = await prisma.tutor.findUnique({
    where: { userId },
    select: {
      applicationStatus: true,
      cvUrl: true,
      qualifications: true,
      subjects: true,
      experience: true,
      rating: true,
      totalReviews: true,
      totalStudents: true,
    },
  });
  if (!tutor) throw appError('Tutor profile not found', 404);
  return { tutorStatus: tutor.applicationStatus, profile: tutor };
}

async function uploadCV(file) {
  const cloudinary = require('../config/cloudinary');
  if (!file) throw appError('CV file is required', 400);

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'tutorlink/cvs', resource_type: 'auto', allowed_formats: ['pdf', 'doc', 'docx'] },
      (error, res) => (error ? reject(error) : resolve(res))
    );
    stream.end(file.buffer);
  });

  return { cvUrl: result.secure_url };
}

async function createClass(userId, body) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);
  if (tutor.applicationStatus !== 'APPROVED') {
    throw appError('You must be an approved tutor to create classes.', 403);
  }

  const { subject, description, venue, mode, location, schedule, time, duration, fees, maxStudents } = body;
  if (!subject) throw appError('Subject is required', 400);
  if (!mode) throw appError('Mode (online/physical) is required', 400);
  if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
    throw appError('At least one class day is required', 400);
  }
  if (!time) throw appError('Time is required', 400);
  if (!duration) throw appError('Duration is required', 400);
  if (!fees && fees !== 0) throw appError('Fees are required', 400);

  return prisma.class.create({
    data: {
      tutorId: tutor.id,
      subject,
      description: description || null,
      venue: venue || null,
      mode,
      location: location || null,
      date: new Date(),
      schedule,
      time,
      duration,
      fees: parseInt(fees),
      maxStudents: parseInt(maxStudents) || 10,
    },
  });
}

async function getMyClasses(userId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);

  return prisma.class.findMany({
    where: { tutorId: tutor.id },
    orderBy: { date: 'asc' },
    include: {
      enrollments: {
        where: { status: 'ACTIVE' },
        include: { student: { include: { user: { select: { fullName: true, email: true } } } } },
      },
    },
  });
}

async function updateClass(userId, classId, body) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);

  const existingClass = await prisma.class.findUnique({ where: { id: classId } });
  if (!existingClass || existingClass.tutorId !== tutor.id) throw appError('Class not found', 404);

  const { subject, description, venue, mode, location, date, time, duration, fees, maxStudents, meetingLink } = body;

  return prisma.class.update({
    where: { id: classId },
    data: {
      ...(subject && { subject }),
      ...(description !== undefined && { description }),
      ...(venue !== undefined && { venue }),
      ...(mode && { mode }),
      ...(location !== undefined && { location }),
      ...(date && { date: new Date(date) }),
      ...(time && { time }),
      ...(duration && { duration }),
      ...(fees !== undefined && { fees: parseInt(fees) }),
      ...(maxStudents && { maxStudents: parseInt(maxStudents) }),
      ...(meetingLink !== undefined && { meetingLink: meetingLink || null }),
    },
  });
}

async function cancelClass(userId, classId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);

  const existingClass = await prisma.class.findUnique({ where: { id: classId } });
  if (!existingClass || existingClass.tutorId !== tutor.id) throw appError('Class not found', 404);

  return prisma.class.update({ where: { id: classId }, data: { status: 'CANCELLED' } });
}

async function deleteClass(userId, classId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);

  const existingClass = await prisma.class.findUnique({
    where: { id: classId },
    include: { enrollments: { include: { payment: true } } },
  });
  if (!existingClass || existingClass.tutorId !== tutor.id) throw appError('Class not found', 404);

  const hasPaidEnrollments = existingClass.enrollments.some((e) => e.payment?.status === 'COMPLETED');
  if (hasPaidEnrollments) {
    throw appError(
      'This class has paid enrollments and can\'t be deleted directly. If you really want to delete it, please contact an admin.',
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    const enrollmentIds = existingClass.enrollments.map((e) => e.id);
    if (enrollmentIds.length > 0) {
      await tx.payment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    }
    await tx.class.delete({ where: { id: classId } });
  });
}

async function getClassById(classId) {
  const classData = await prisma.class.findUnique({
    where: { id: classId },
    include: { tutor: { include: { user: { select: { fullName: true, email: true } } } } },
  });
  if (!classData) throw appError('Class not found', 404);
  return classData;
}

async function recordHeartbeat(userId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) throw appError('Tutor profile not found', 404);

  return prisma.tutor.update({
    where: { id: tutor.id },
    data: { lastOnlineAt: new Date(), isAvailable: true },
    select: { lastOnlineAt: true, isAvailable: true },
  });
}

// Admin functions

async function getPendingApplications() {
  return prisma.tutor.findMany({
    where: { applicationStatus: 'PENDING' },
    include: { user: { select: { id: true, fullName: true, email: true, createdAt: true } } },
    orderBy: { updatedAt: 'asc' },
  });
}

async function getAllApplications(status) {
  const where = status ? { applicationStatus: status.toUpperCase() } : {};
  return prisma.tutor.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          createdAt: true,
          isEmailVerified: true,
          student: {
            select: {
              id: true, dob: true, phone: true, address: true,
              schoolGrade: true, schoolName: true, parentName: true, parentPhone: true, avatar: true,
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

async function approveApplication(tutorId) {
  const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
  if (!tutor) throw appError('Tutor not found', 404);
  if (tutor.applicationStatus !== 'PENDING') throw appError('Application is not in PENDING status', 400);

  return prisma.tutor.update({
    where: { id: tutorId },
    data: { applicationStatus: 'APPROVED', isVerified: true },
  });
}

async function rejectApplication(tutorId) {
  const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
  if (!tutor) throw appError('Tutor not found', 404);
  if (tutor.applicationStatus !== 'PENDING') throw appError('Application is not in PENDING status', 400);

  return prisma.tutor.update({
    where: { id: tutorId },
    data: {
      applicationStatus: 'REJECTED',
      qualifications: null,
      subjects: [],
      experience: null,
      cvUrl: null,
      idCopyFront: null,
      idCopyBack: null,
      idCopyPdf: null,
    },
  });
}

async function getAllClassesAdmin() {
  const classes = await prisma.class.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      tutor: {
        include: {
          user: { select: { fullName: true, email: true, student: { select: { avatar: true } } } },
        },
      },
      enrollments: { include: { payment: true } },
    },
  });

  return classes.map((c) => {
    const paidCount = c.enrollments.filter((e) => e.payment?.status === 'COMPLETED').length;
    return {
      id: c.id,
      subject: c.subject,
      description: c.description,
      mode: c.mode,
      venue: c.venue,
      schedule: c.schedule,
      time: c.time,
      duration: c.duration,
      fees: c.fees,
      maxStudents: c.maxStudents,
      enrolledCount: c.enrolledCount,
      paidEnrollments: paidCount,
      totalEnrollments: c.enrollments.length,
      status: c.status,
      createdAt: c.createdAt,
      tutorId: c.tutorId,
      tutorName: c.tutor.user.fullName,
      tutorEmail: c.tutor.user.email,
      tutorAvatar: c.tutor.avatar || c.tutor.user.student?.avatar || null,
    };
  });
}

async function holdClassAdmin(classId) {
  const existing = await prisma.class.findUnique({
    where: { id: classId },
    include: { tutor: { select: { userId: true } } },
  });
  if (!existing) throw appError('Class not found', 404);
  if (existing.status === 'CANCELLED') throw appError('Cannot hold a cancelled class', 400);

  const updated = await prisma.class.update({ where: { id: classId }, data: { status: 'ON_HOLD' } });

  createNotification({
    userId: existing.tutor.userId,
    type: 'CLASS_ON_HOLD',
    title: 'Your class has been placed on hold',
    message: `An admin has put "${existing.subject}" on hold. Please contact the admin team for more details.`,
  }).catch((e) => console.error('Notify tutor (hold) failed:', e));

  return updated;
}

async function unholdClassAdmin(classId) {
  const existing = await prisma.class.findUnique({
    where: { id: classId },
    include: { tutor: { select: { userId: true } } },
  });
  if (!existing) throw appError('Class not found', 404);
  if (existing.status !== 'ON_HOLD') throw appError('Class is not on hold', 400);

  const updated = await prisma.class.update({ where: { id: classId }, data: { status: 'ACTIVE' } });

  createNotification({
    userId: existing.tutor.userId,
    type: 'CLASS_RESUMED',
    title: 'Your class is active again',
    message: `An admin has resumed "${existing.subject}". You can continue teaching as normal.`,
  }).catch((e) => console.error('Notify tutor (unhold) failed:', e));

  return updated;
}

async function forceDeleteClassAdmin(classId) {
  const existing = await prisma.class.findUnique({ where: { id: classId } });
  if (!existing) throw appError('Class not found', 404);

  await prisma.$transaction(async (tx) => {
    const enrollments = await tx.enrollment.findMany({ where: { classId }, select: { id: true } });
    const enrollmentIds = enrollments.map((e) => e.id);
    if (enrollmentIds.length > 0) {
      await tx.payment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    }
    await tx.class.delete({ where: { id: classId } });
  });
}

module.exports = {
  submitApplication,
  getApplicationStatus,
  uploadCV,
  createClass,
  getMyClasses,
  updateClass,
  cancelClass,
  deleteClass,
  getClassById,
  recordHeartbeat,
  getPendingApplications,
  getAllApplications,
  approveApplication,
  rejectApplication,
  getAllClassesAdmin,
  holdClassAdmin,
  unholdClassAdmin,
  forceDeleteClassAdmin,
};
