const { prisma } = require('../models');

function appError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

async function createReview(userId, { enrollmentId, rating, comment }) {
  if (!enrollmentId || !rating) throw appError('enrollmentId and rating are required', 400);
  if (rating < 1 || rating > 5) throw appError('Rating must be between 1 and 5', 400);

  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw appError('Student profile required', 403);

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { class: true } });
  if (!enrollment || enrollment.studentId !== student.id) throw appError('Enrollment not found', 404);
  if (enrollment.status !== 'ACTIVE') throw appError('Can only review active enrollments', 400);

  const existing = await prisma.review.findUnique({ where: { enrollmentId } });
  if (existing) throw appError('You have already reviewed this enrollment', 400);

  const tutorId = enrollment.class.tutorId;

  const [review] = await prisma.$transaction(async (tx) => {
    const newReview = await tx.review.create({
      data: {
        tutorId,
        studentId: student.id,
        enrollmentId,
        rating: parseInt(rating),
        comment: comment?.trim() || null,
      },
      include: { student: { include: { user: { select: { fullName: true } } } } },
    });

    const agg = await tx.review.aggregate({
      where: { tutorId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tutor.update({
      where: { id: tutorId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        totalReviews: agg._count.rating,
      },
    });

    return [newReview];
  });

  return review;
}

async function getTutorReviews(tutorId) {
  const reviews = await prisma.review.findMany({
    where: { tutorId },
    orderBy: { createdAt: 'desc' },
    include: {
      student: { include: { user: { select: { fullName: true } } } },
      enrollment: { include: { class: { select: { id: true, subject: true } } } },
    },
  });

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    enrollmentId: r.enrollmentId,
    classId: r.enrollment.class.id,
    classSubject: r.enrollment.class.subject,
    studentName: r.student.user.fullName,
    studentAvatar: r.student.avatar || null,
  }));
}

async function getClassReviews(classId) {
  const reviews = await prisma.review.findMany({
    where: { enrollment: { classId } },
    orderBy: { createdAt: 'desc' },
    include: { student: { include: { user: { select: { fullName: true } } } } },
  });

  const formatted = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    enrollmentId: r.enrollmentId,
    studentName: r.student.user.fullName,
    studentAvatar: r.student.avatar || null,
  }));

  const avgRating =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return {
    reviews: formatted,
    count: reviews.length,
    averageRating: Math.round(avgRating * 10) / 10,
  };
}

async function deleteReview(userId, reviewId) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw appError('Student profile required', 403);

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.studentId !== student.id) throw appError('Review not found', 404);

  const tutorId = review.tutorId;

  await prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id: reviewId } });

    const agg = await tx.review.aggregate({
      where: { tutorId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.tutor.update({
      where: { id: tutorId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        totalReviews: agg._count.rating,
      },
    });
  });
}

async function getMyReview(userId, enrollmentId) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student) throw appError('Student profile required', 403);
  return prisma.review.findUnique({ where: { enrollmentId } });
}

module.exports = { createReview, getTutorReviews, getClassReviews, deleteReview, getMyReview };
