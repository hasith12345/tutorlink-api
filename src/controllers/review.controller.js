const { prisma } = require("../models");

// POST /api/reviews
exports.createReview = async (req, res) => {
  try {
    const { enrollmentId, rating, comment } = req.body;

    if (!enrollmentId || !rating) {
      return res.status(400).json({ message: "enrollmentId and rating are required" });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required" });

    // Verify enrollment belongs to this student and is ACTIVE
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { class: true },
    });
    if (!enrollment || enrollment.studentId !== student.id) {
      return res.status(404).json({ message: "Enrollment not found" });
    }
    if (enrollment.status !== "ACTIVE") {
      return res.status(400).json({ message: "Can only review active enrollments" });
    }

    // Check not already reviewed
    const existing = await prisma.review.findUnique({ where: { enrollmentId } });
    if (existing) {
      return res.status(400).json({ message: "You have already reviewed this enrollment" });
    }

    const tutorId = enrollment.class.tutorId;

    // Create review + recalculate tutor rating atomically
    const [review] = await prisma.$transaction(async (tx) => {
      const newReview = await tx.review.create({
        data: {
          tutorId,
          studentId: student.id,
          enrollmentId,
          rating: parseInt(rating),
          comment: comment?.trim() || null,
        },
        include: {
          student: { include: { user: { select: { fullName: true } } } },
        },
      });

      // Recalculate avg rating
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

    res.status(201).json({ review });
  } catch (err) {
    console.error("createReview error:", err);
    res.status(500).json({ message: "Failed to submit review" });
  }
};

// GET /api/reviews/tutor/:tutorId
exports.getTutorReviews = async (req, res) => {
  try {
    const { tutorId } = req.params;

    const reviews = await prisma.review.findMany({
      where: { tutorId },
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          include: { user: { select: { fullName: true } } },
        },
        enrollment: {
          include: { class: { select: { id: true, subject: true } } },
        },
      },
    });

    const formatted = reviews.map((r) => ({
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

    res.json({ reviews: formatted });
  } catch (err) {
    console.error("getTutorReviews error:", err);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
};

// GET /api/reviews/class/:classId  — reviews for a specific class
exports.getClassReviews = async (req, res) => {
  try {
    const { classId } = req.params;

    const reviews = await prisma.review.findMany({
      where: { enrollment: { classId } },
      orderBy: { createdAt: "desc" },
      include: {
        student: {
          include: { user: { select: { fullName: true } } },
        },
      },
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

    const avgRating = reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    res.json({
      reviews: formatted,
      count: reviews.length,
      averageRating: Math.round(avgRating * 10) / 10,
    });
  } catch (err) {
    console.error("getClassReviews error:", err);
    res.status(500).json({ message: "Failed to fetch class reviews" });
  }
};

// DELETE /api/reviews/:id
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required" });

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review || review.studentId !== student.id) {
      return res.status(404).json({ message: "Review not found" });
    }

    const tutorId = review.tutorId;

    await prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });

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

    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error("deleteReview error:", err);
    res.status(500).json({ message: "Failed to delete review" });
  }
};

// GET /api/reviews/my-review/:enrollmentId  — check if student already reviewed
exports.getMyReview = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const student = await prisma.student.findUnique({ where: { userId: req.user.id } });
    if (!student) return res.status(403).json({ message: "Student profile required" });

    const review = await prisma.review.findUnique({ where: { enrollmentId } });
    res.json({ review: review || null });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch review" });
  }
};
