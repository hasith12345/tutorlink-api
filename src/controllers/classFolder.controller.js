const { prisma } = require("../models");
const cloudinary = require("../config/cloudinary");

// Helper: resolve cloudinary resource_type from stored resourceType string
function toCloudinaryResourceType(resourceType) {
  if (resourceType === "image") return "image";
  if (resourceType === "video") return "video";
  return "raw";
}

// Helper: verify a tutor owns the class
async function verifyTutorOwnsClass(userId, classId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) return null;
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || cls.tutorId !== tutor.id) return null;
  return tutor;
}

// POST /api/tutor/classes/:classId/folders
exports.createFolder = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    const tutor = await verifyTutorOwnsClass(req.user.id, classId);
    if (!tutor) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Place new folder at the end
    const maxOrderResult = await prisma.classFolder.aggregate({
      where: { classId },
      _max: { order: true },
    });
    const nextOrder = (maxOrderResult._max.order ?? -1) + 1;

    const folder = await prisma.classFolder.create({
      data: { classId, name: name.trim(), order: nextOrder },
      include: { materials: true },
    });

    res.status(201).json({ folder });
  } catch (err) {
    next(err);
  }
};

// GET /api/tutor/classes/:classId/folders
exports.getFolders = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const userId = req.user.id;

    // Determine if caller is tutor owner or enrolled student
    const tutor = await prisma.tutor.findUnique({ where: { userId } });
    let isTutorOwner = false;

    if (tutor) {
      const cls = await prisma.class.findUnique({ where: { id: classId } });
      isTutorOwner = cls && cls.tutorId === tutor.id;
    }

    if (!isTutorOwner) {
      // Must be an enrolled student
      const student = await prisma.student.findUnique({ where: { userId } });
      if (!student) {
        return res.status(403).json({ message: "Not authorized" });
      }
      const now = new Date();
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          classId,
          studentId: student.id,
          OR: [
            { status: "ACTIVE" },
            { status: "UNENROLLED", accessUntil: { gt: now } },
          ],
        },
        include: { payment: true },
      });
      if (!enrollment) {
        return res.status(403).json({ message: "Not enrolled in this class or access has expired" });
      }

      // Block access when monthly payment is overdue past the 15-day grace period
      if (enrollment.status === "ACTIVE" && enrollment.payment?.paidAt) {
        const paidAt = new Date(enrollment.payment.paidAt);
        const enrolledAt = new Date(enrollment.enrolledAt);
        const periodStart = paidAt < enrolledAt ? paidAt : enrolledAt;
        const accessExpiresAt = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 15, 23, 59, 59);
        if (now > accessExpiresAt) {
          return res.status(403).json({ message: "Monthly payment is overdue. Renew payment to regain access." });
        }
      }
    }

    const folders = await prisma.classFolder.findMany({
      where: { classId },
      orderBy: { order: "asc" },
      include: {
        materials: {
          where: isTutorOwner ? {} : { isPublished: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    res.json({ folders, isTutorOwner });
  } catch (err) {
    next(err);
  }
};

// PUT /api/tutor/classes/:classId/folders/:id
exports.updateFolder = async (req, res, next) => {
  try {
    const { classId, id } = req.params;
    const { name, order } = req.body;

    const tutor = await verifyTutorOwnsClass(req.user.id, classId);
    if (!tutor) {
      return res.status(404).json({ message: "Class not found" });
    }

    const existing = await prisma.classFolder.findUnique({ where: { id } });
    if (!existing || existing.classId !== classId) {
      return res.status(404).json({ message: "Folder not found" });
    }

    const folder = await prisma.classFolder.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(order !== undefined && { order: parseInt(order) }),
      },
      include: { materials: true },
    });

    res.json({ folder });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/tutor/classes/:classId/folders/:id
exports.deleteFolder = async (req, res, next) => {
  try {
    const { classId, id } = req.params;

    const tutor = await verifyTutorOwnsClass(req.user.id, classId);
    if (!tutor) {
      return res.status(404).json({ message: "Class not found" });
    }

    const folder = await prisma.classFolder.findUnique({
      where: { id },
      include: { materials: true },
    });
    if (!folder || folder.classId !== classId) {
      return res.status(404).json({ message: "Folder not found" });
    }

    // Delete all materials from Cloudinary
    for (const material of folder.materials) {
      try {
        await cloudinary.uploader.destroy(material.publicId, {
          resource_type: toCloudinaryResourceType(material.resourceType),
        });
      } catch (e) {
        console.warn("Cloudinary delete failed for", material.publicId, e.message);
      }
    }

    await prisma.classFolder.delete({ where: { id } });

    res.json({ message: "Folder deleted" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/tutor/classes/:classId/materials/:id
exports.updateMaterial = async (req, res, next) => {
  try {
    const { classId, id } = req.params;
    const { isPublished, description } = req.body;

    const tutor = await verifyTutorOwnsClass(req.user.id, classId);
    if (!tutor) {
      return res.status(404).json({ message: "Class not found" });
    }

    const material = await prisma.classMaterial.findUnique({
      where: { id },
      include: { folder: true },
    });
    if (!material || material.folder.classId !== classId) {
      return res.status(404).json({ message: "Material not found" });
    }

    const updated = await prisma.classMaterial.update({
      where: { id },
      data: {
        ...(isPublished !== undefined && { isPublished: Boolean(isPublished) }),
        ...(description !== undefined && { description: description || null }),
      },
    });

    res.json({ material: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/tutor/classes/:classId/materials/:id
exports.deleteMaterial = async (req, res, next) => {
  try {
    const { classId, id } = req.params;

    const tutor = await verifyTutorOwnsClass(req.user.id, classId);
    if (!tutor) {
      return res.status(404).json({ message: "Class not found" });
    }

    const material = await prisma.classMaterial.findUnique({
      where: { id },
      include: { folder: true },
    });
    if (!material || material.folder.classId !== classId) {
      return res.status(404).json({ message: "Material not found" });
    }

    try {
      await cloudinary.uploader.destroy(material.publicId, {
        resource_type: toCloudinaryResourceType(material.resourceType),
      });
    } catch (e) {
      console.warn("Cloudinary delete failed for", material.publicId, e.message);
    }

    await prisma.classMaterial.delete({ where: { id } });

    res.json({ message: "Material deleted" });
  } catch (err) {
    next(err);
  }
};
