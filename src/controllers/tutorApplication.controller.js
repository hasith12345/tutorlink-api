const { prisma } = require("../models");
const { createNotification } = require("../services/notification.service");

// ✅ Submit tutor application (upload CV, qualifications, subjects, experience)
exports.submitTutorApplication = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { cvUrl, qualifications, subjects, experience } = req.body;

    if (!qualifications) {
      return res.status(400).json({ message: "Qualifications are required" });
    }

    if (!subjects || (Array.isArray(subjects) && subjects.length === 0)) {
      return res.status(400).json({ message: "At least one subject is required" });
    }

    // Find the tutor profile
    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found. Please sign up as a tutor first." });
    }

    // Allow resubmission if PENDING but no qualifications/subjects were ever provided
    const alreadyHasDetails = tutor.qualifications && tutor.subjects && tutor.subjects.length > 0;
    if (tutor.applicationStatus === "PENDING" && alreadyHasDetails) {
      return res.status(400).json({ message: "Your application is already under review." });
    }

    if (tutor.applicationStatus === "APPROVED") {
      return res.status(400).json({ message: "Your application has already been approved." });
    }

    // REJECTED: allow fresh resubmission (data was already cleared on rejection)

    // Update tutor profile with application data
    const updatedTutor = await prisma.tutor.update({
      where: { userId },
      data: {
        cvUrl: cvUrl || null,
        qualifications,
        subjects: Array.isArray(subjects) ? subjects : [subjects],
        experience: experience || null,
        applicationStatus: "PENDING",
      },
    });

    console.log("Tutor application submitted for user:", userId);
    res.json({
      message: "Tutor application submitted successfully! You will be notified once reviewed.",
      tutorStatus: updatedTutor.applicationStatus,
    });
  } catch (err) {
    console.error("Submit tutor application error:", err);
    next(err);
  }
};

// ✅ Get tutor application status
exports.getTutorApplicationStatus = async (req, res, next) => {
  try {
    const userId = req.user.id;

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

    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    res.json({
      tutorStatus: tutor.applicationStatus,
      profile: tutor,
    });
  } catch (err) {
    console.error("Get tutor status error:", err);
    next(err);
  }
};

// ✅ Upload CV file (returns Cloudinary URL)
exports.uploadCV = async (req, res, next) => {
  try {
    const cloudinary = require("../config/cloudinary");

    if (!req.file) {
      return res.status(400).json({ message: "CV file is required" });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "tutorlink/cvs",
          resource_type: "auto",
          allowed_formats: ["pdf", "doc", "docx"],
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    res.json({
      message: "CV uploaded successfully",
      cvUrl: result.secure_url,
    });
  } catch (err) {
    console.error("Upload CV error:", err);
    next(err);
  }
};

// ========================
// CLASS MANAGEMENT
// ========================

// ✅ Create a class
exports.createClass = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find tutor and check approval status
    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    if (tutor.applicationStatus !== "APPROVED") {
      return res.status(403).json({ message: "You must be an approved tutor to create classes." });
    }

    const { subject, description, venue, mode, location, schedule, time, duration, fees, maxStudents } = req.body;

    if (!subject) return res.status(400).json({ message: "Subject is required" });
    if (!mode) return res.status(400).json({ message: "Mode (online/physical) is required" });
    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) return res.status(400).json({ message: "At least one class day is required" });
    if (!time) return res.status(400).json({ message: "Time is required" });
    if (!duration) return res.status(400).json({ message: "Duration is required" });
    if (!fees && fees !== 0) return res.status(400).json({ message: "Fees are required" });

    // Use today as the base date for recurring classes
    const newClass = await prisma.class.create({
      data: {
        tutorId: tutor.id,
        subject,
        description: description || null,
        venue: venue || null,
        mode,
        location: location || null,
        date: new Date(),
        schedule: schedule,
        time,
        duration,
        fees: parseInt(fees),
        maxStudents: parseInt(maxStudents) || 10,
      },
    });

    console.log("Class created:", newClass.id);
    res.status(201).json({
      message: "Class created successfully",
      class: newClass,
    });
  } catch (err) {
    console.error("Create class error:", err);
    next(err);
  }
};

// ✅ Get tutor's classes
exports.getMyClasses = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    const classes = await prisma.class.findMany({
      where: { tutorId: tutor.id },
      orderBy: { date: "asc" },
      include: {
        enrollments: {
          where: { status: "ACTIVE" },
          include: {
            student: {
              include: { user: { select: { fullName: true, email: true } } },
            },
          },
        },
      },
    });

    res.json({ classes });
  } catch (err) {
    console.error("Get classes error:", err);
    next(err);
  }
};

// ✅ Update a class
exports.updateClass = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const classId = req.params.id;

    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    // Check class belongs to this tutor
    const existingClass = await prisma.class.findUnique({ where: { id: classId } });
    if (!existingClass || existingClass.tutorId !== tutor.id) {
      return res.status(404).json({ message: "Class not found" });
    }

    const { subject, description, venue, mode, location, date, time, duration, fees, maxStudents, meetingLink } = req.body;

    const updatedClass = await prisma.class.update({
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

    res.json({ message: "Class updated successfully", class: updatedClass });
  } catch (err) {
    console.error("Update class error:", err);
    next(err);
  }
};

// ✅ Cancel a class
exports.cancelClass = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const classId = req.params.id;

    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor profile not found" });
    }

    const existingClass = await prisma.class.findUnique({ where: { id: classId } });
    if (!existingClass || existingClass.tutorId !== tutor.id) {
      return res.status(404).json({ message: "Class not found" });
    }

    const cancelled = await prisma.class.update({
      where: { id: classId },
      data: { status: "CANCELLED" },
    });

    res.json({ message: "Class cancelled successfully", class: cancelled });
  } catch (err) {
    console.error("Cancel class error:", err);
    next(err);
  }
};

// ✅ Delete a class permanently
exports.deleteClass = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const classId = req.params.id;

    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) return res.status(404).json({ message: "Tutor profile not found" });

    const existingClass = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        enrollments: { include: { payment: true } },
      },
    });
    if (!existingClass || existingClass.tutorId !== tutor.id) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Block deletion if any student has paid for this class — financial records can't be wiped
    const hasPaidEnrollments = existingClass.enrollments.some(
      (e) => e.payment && e.payment.status === "COMPLETED"
    );
    if (hasPaidEnrollments) {
      return res.status(400).json({
        message:
          "This class has paid enrollments and can't be deleted directly. If you really want to delete it, please contact an admin.",
      });
    }

    // No paid enrollments — safe to delete. Remove unpaid payments and enrollments first.
    await prisma.$transaction(async (tx) => {
      const enrollmentIds = existingClass.enrollments.map((e) => e.id);
      if (enrollmentIds.length > 0) {
        await tx.payment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      }
      await tx.class.delete({ where: { id: classId } });
    });

    res.json({ message: "Class deleted successfully" });
  } catch (err) {
    console.error("Delete class error:", err);
    next(err);
  }
};

// ✅ Get a single class by ID
exports.getClassById = async (req, res, next) => {
  try {
    const classId = req.params.id;

    const classData = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        tutor: {
          include: {
            user: { select: { fullName: true, email: true } },
          },
        },
      },
    });

    if (!classData) {
      return res.status(404).json({ message: "Class not found" });
    }

    res.json({ class: classData });
  } catch (err) {
    console.error("Get class error:", err);
    next(err);
  }
};

// ========================
// ADMIN ENDPOINTS
// ========================

// ✅ Get all pending tutor applications (admin only)
exports.getPendingApplications = async (req, res, next) => {
  try {
    const applications = await prisma.tutor.findMany({
      where: { applicationStatus: "PENDING" },
      include: {
        user: { select: { id: true, fullName: true, email: true, createdAt: true } },
      },
      orderBy: { updatedAt: "asc" },
    });

    res.json({ applications });
  } catch (err) {
    console.error("Get pending applications error:", err);
    next(err);
  }
};

// ✅ Get all tutor applications (admin only)
exports.getAllApplications = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { applicationStatus: status.toUpperCase() } : {};

    const applications = await prisma.tutor.findMany({
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
                id: true,
                dob: true,
                phone: true,
                address: true,
                schoolGrade: true,
                schoolName: true,
                parentName: true,
                parentPhone: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ applications });
  } catch (err) {
    console.error("Get all applications error:", err);
    next(err);
  }
};

// ✅ Approve a tutor application (admin only)
exports.approveApplication = async (req, res, next) => {
  try {
    const tutorId = req.params.id;

    const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }

    if (tutor.applicationStatus !== "PENDING") {
      return res.status(400).json({ message: "Application is not in PENDING status" });
    }

    const approved = await prisma.tutor.update({
      where: { id: tutorId },
      data: {
        applicationStatus: "APPROVED",
        isVerified: true,
      },
    });

    console.log("Tutor application approved:", tutorId);
    res.json({ message: "Tutor application approved", tutor: approved });
  } catch (err) {
    console.error("Approve application error:", err);
    next(err);
  }
};

// ✅ Reject a tutor application (admin only)
exports.rejectApplication = async (req, res, next) => {
  try {
    const tutorId = req.params.id;
    const { reason } = req.body;

    const tutor = await prisma.tutor.findUnique({ where: { id: tutorId } });
    if (!tutor) {
      return res.status(404).json({ message: "Tutor not found" });
    }

    if (tutor.applicationStatus !== "PENDING") {
      return res.status(400).json({ message: "Application is not in PENDING status" });
    }

    // Clear all application data so the tutor can reapply fresh
    const rejected = await prisma.tutor.update({
      where: { id: tutorId },
      data: {
        applicationStatus: "REJECTED",
        qualifications: null,
        subjects: [],
        experience: null,
        cvUrl: null,
        idCopyFront: null,
        idCopyBack: null,
        idCopyPdf: null,
      },
    });

    console.log("Tutor application rejected and data cleared:", tutorId);
    res.json({ message: "Tutor application rejected", tutor: rejected });
  } catch (err) {
    console.error("Reject application error:", err);
    next(err);
  }
};

// ========================
// ADMIN — CLASSES MANAGEMENT
// ========================

// ✅ Get all classes (with tutor info + enrollment counts)
exports.getAllClassesAdmin = async (req, res, next) => {
  try {
    const classes = await prisma.class.findMany({
      orderBy: { createdAt: "desc" },
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
        enrollments: {
          include: { payment: true },
        },
      },
    });

    const payload = classes.map((c) => {
      const paidCount = c.enrollments.filter((e) => e.payment?.status === "COMPLETED").length;
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

    res.json({ classes: payload });
  } catch (err) {
    console.error("Admin get classes error:", err);
    next(err);
  }
};

// ✅ Hold a class (admin) — temporarily pauses it
exports.holdClassAdmin = async (req, res, next) => {
  try {
    const classId = req.params.id;
    const existing = await prisma.class.findUnique({
      where: { id: classId },
      include: { tutor: { select: { userId: true } } },
    });
    if (!existing) return res.status(404).json({ message: "Class not found" });
    if (existing.status === "CANCELLED") {
      return res.status(400).json({ message: "Cannot hold a cancelled class" });
    }
    const updated = await prisma.class.update({
      where: { id: classId },
      data: { status: "ON_HOLD" },
    });

    // Notify the tutor
    createNotification({
      userId: existing.tutor.userId,
      type: "CLASS_ON_HOLD",
      title: "Your class has been placed on hold",
      message: `An admin has put "${existing.subject}" on hold. Please contact the admin team for more details.`,
    }).catch((e) => console.error("Notify tutor (hold) failed:", e));

    res.json({ message: "Class put on hold", class: updated });
  } catch (err) {
    console.error("Hold class error:", err);
    next(err);
  }
};

// ✅ Unhold a class (admin) — resumes from hold
exports.unholdClassAdmin = async (req, res, next) => {
  try {
    const classId = req.params.id;
    const existing = await prisma.class.findUnique({
      where: { id: classId },
      include: { tutor: { select: { userId: true } } },
    });
    if (!existing) return res.status(404).json({ message: "Class not found" });
    if (existing.status !== "ON_HOLD") {
      return res.status(400).json({ message: "Class is not on hold" });
    }
    const updated = await prisma.class.update({
      where: { id: classId },
      data: { status: "ACTIVE" },
    });

    // Notify the tutor
    createNotification({
      userId: existing.tutor.userId,
      type: "CLASS_RESUMED",
      title: "Your class is active again",
      message: `An admin has resumed "${existing.subject}". You can continue teaching as normal.`,
    }).catch((e) => console.error("Notify tutor (unhold) failed:", e));

    res.json({ message: "Class resumed", class: updated });
  } catch (err) {
    console.error("Unhold class error:", err);
    next(err);
  }
};

// ✅ Force-delete a class (admin) — wipes enrollments, payments, reviews, folders, conversations, messages
exports.forceDeleteClassAdmin = async (req, res, next) => {
  try {
    const classId = req.params.id;
    const existing = await prisma.class.findUnique({ where: { id: classId } });
    if (!existing) return res.status(404).json({ message: "Class not found" });

    await prisma.$transaction(async (tx) => {
      // Fetch enrollment ids first (so we can delete payments + reviews)
      const enrollments = await tx.enrollment.findMany({
        where: { classId },
        select: { id: true },
      });
      const enrollmentIds = enrollments.map((e) => e.id);

      if (enrollmentIds.length > 0) {
        // Payment doesn't cascade — delete manually
        await tx.payment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      }

      // Enrollments, folders, materials all cascade from Class deletion
      await tx.class.delete({ where: { id: classId } });
    });

    res.json({ message: "Class force-deleted successfully" });
  } catch (err) {
    console.error("Force delete class error:", err);
    next(err);
  }
};
