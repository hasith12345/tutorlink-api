const { prisma } = require('../models');
const cloudinary = require('../config/cloudinary');

function appError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

function toCloudinaryResourceType(resourceType) {
  if (resourceType === 'image') return 'image';
  if (resourceType === 'video') return 'video';
  return 'raw';
}

async function verifyTutorOwnsClass(userId, classId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  if (!tutor) return null;
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls || cls.tutorId !== tutor.id) return null;
  return tutor;
}

async function createFolder(userId, classId, name) {
  if (!name || !name.trim()) throw appError('Folder name is required', 400);

  const tutor = await verifyTutorOwnsClass(userId, classId);
  if (!tutor) throw appError('Class not found', 404);

  const maxOrderResult = await prisma.classFolder.aggregate({ where: { classId }, _max: { order: true } });
  const nextOrder = (maxOrderResult._max.order ?? -1) + 1;

  return prisma.classFolder.create({
    data: { classId, name: name.trim(), order: nextOrder },
    include: { materials: true },
  });
}

async function getFolders(userId, classId) {
  const tutor = await prisma.tutor.findUnique({ where: { userId } });
  let isTutorOwner = false;

  if (tutor) {
    const cls = await prisma.class.findUnique({ where: { id: classId } });
    isTutorOwner = cls && cls.tutorId === tutor.id;
  }

  if (!isTutorOwner) {
    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) throw appError('Not authorized', 403);

    const now = new Date();
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        classId,
        studentId: student.id,
        OR: [{ status: 'ACTIVE' }, { status: 'UNENROLLED', accessUntil: { gt: now } }],
      },
      include: { payment: true },
    });
    if (!enrollment) throw appError('Not enrolled in this class or access has expired', 403);

    if (enrollment.status === 'ACTIVE' && enrollment.payment?.paidAt) {
      const paidAt = new Date(enrollment.payment.paidAt);
      const enrolledAt = new Date(enrollment.enrolledAt);
      const periodStart = paidAt < enrolledAt ? paidAt : enrolledAt;
      const accessExpiresAt = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 15, 23, 59, 59);
      if (now > accessExpiresAt) {
        throw appError('Monthly payment is overdue. Renew payment to regain access.', 403);
      }
    }
  }

  const folders = await prisma.classFolder.findMany({
    where: { classId },
    orderBy: { order: 'asc' },
    include: {
      materials: {
        where: isTutorOwner ? {} : { isPublished: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return { folders, isTutorOwner };
}

async function updateFolder(userId, classId, folderId, { name, order }) {
  const tutor = await verifyTutorOwnsClass(userId, classId);
  if (!tutor) throw appError('Class not found', 404);

  const existing = await prisma.classFolder.findUnique({ where: { id: folderId } });
  if (!existing || existing.classId !== classId) throw appError('Folder not found', 404);

  return prisma.classFolder.update({
    where: { id: folderId },
    data: {
      ...(name && { name: name.trim() }),
      ...(order !== undefined && { order: parseInt(order) }),
    },
    include: { materials: true },
  });
}

async function deleteFolder(userId, classId, folderId) {
  const tutor = await verifyTutorOwnsClass(userId, classId);
  if (!tutor) throw appError('Class not found', 404);

  const folder = await prisma.classFolder.findUnique({ where: { id: folderId }, include: { materials: true } });
  if (!folder || folder.classId !== classId) throw appError('Folder not found', 404);

  for (const material of folder.materials) {
    try {
      await cloudinary.uploader.destroy(material.publicId, {
        resource_type: toCloudinaryResourceType(material.resourceType),
      });
    } catch (e) {
      console.warn('Cloudinary delete failed for', material.publicId, e.message);
    }
  }

  await prisma.classFolder.delete({ where: { id: folderId } });
}

async function updateMaterial(userId, classId, materialId, { isPublished, description }) {
  const tutor = await verifyTutorOwnsClass(userId, classId);
  if (!tutor) throw appError('Class not found', 404);

  const material = await prisma.classMaterial.findUnique({ where: { id: materialId }, include: { folder: true } });
  if (!material || material.folder.classId !== classId) throw appError('Material not found', 404);

  return prisma.classMaterial.update({
    where: { id: materialId },
    data: {
      ...(isPublished !== undefined && { isPublished: Boolean(isPublished) }),
      ...(description !== undefined && { description: description || null }),
    },
  });
}

async function deleteMaterial(userId, classId, materialId) {
  const tutor = await verifyTutorOwnsClass(userId, classId);
  if (!tutor) throw appError('Class not found', 404);

  const material = await prisma.classMaterial.findUnique({ where: { id: materialId }, include: { folder: true } });
  if (!material || material.folder.classId !== classId) throw appError('Material not found', 404);

  try {
    await cloudinary.uploader.destroy(material.publicId, {
      resource_type: toCloudinaryResourceType(material.resourceType),
    });
  } catch (e) {
    console.warn('Cloudinary delete failed for', material.publicId, e.message);
  }

  await prisma.classMaterial.delete({ where: { id: materialId } });
}

module.exports = { createFolder, getFolders, updateFolder, deleteFolder, updateMaterial, deleteMaterial };
