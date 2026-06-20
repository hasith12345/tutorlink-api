const { prisma } = require('../models');

function appError(message, statusCode = 500) {
  return Object.assign(new Error(message), { statusCode });
}

async function searchTutors({ subject, location, learningMode, limit = 50 }) {
  const classFilter = { status: 'ACTIVE' };
  if (learningMode && ['online', 'physical', 'hybrid'].includes(learningMode)) {
    classFilter.mode = learningMode;
  }

  const filters = {
    isAvailable: true,
    applicationStatus: 'APPROVED',
    classes: { some: classFilter },
  };

  if (subject && subject.trim()) {
    const q = subject.trim();
    filters.OR = [
      { subject: { contains: q, mode: 'insensitive' } },
      { subjects: { has: q } },
      { user: { fullName: { contains: q, mode: 'insensitive' } } },
      { classes: { some: { ...classFilter, subject: { contains: q, mode: 'insensitive' } } } },
    ];
  }

  if (location && location.trim()) {
    filters.location = { contains: location, mode: 'insensitive' };
  }

  const tutors = await prisma.tutor.findMany({
    where: filters,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          student: { select: { avatar: true } },
        },
      },
      classes: { where: { status: 'ACTIVE' }, orderBy: { fees: 'asc' } },
    },
    take: parseInt(limit),
    orderBy: [{ rating: 'desc' }, { totalStudents: 'desc' }],
  });

  return tutors.map((tutor) => ({
    id: tutor.id,
    userId: tutor.userId,
    name: tutor.user.fullName,
    email: tutor.user.email,
    subject: tutor.subject,
    subjects: tutor.subjects,
    location: tutor.location,
    bio: tutor.bio,
    experience: tutor.experience,
    education: tutor.education,
    hourlyRate: tutor.hourlyRate,
    learningMode: tutor.learningMode,
    rating: tutor.rating,
    totalReviews: tutor.totalReviews,
    totalStudents: tutor.totalStudents,
    isVerified: tutor.isVerified,
    avatar: tutor.avatar || tutor.user.student?.avatar || null,
    classes: tutor.classes,
    lowestFee: tutor.classes.length > 0 ? Math.min(...tutor.classes.map((c) => c.fees)) : null,
  }));
}

async function getTutorSuggestions({ query, limit = 10 }) {
  const q = (query || '').trim();
  const take = parseInt(limit);

  const baseFilter = {
    isAvailable: true,
    applicationStatus: 'APPROVED',
    classes: { some: { status: 'ACTIVE' } },
  };

  const [tutorRows, classRows] = await Promise.all([
    prisma.tutor.findMany({ where: baseFilter, select: { subject: true, subjects: true } }),
    prisma.class.findMany({ where: { status: 'ACTIVE', tutor: baseFilter }, select: { subject: true } }),
  ]);

  const subjectCounts = new Map();
  const bumpSubject = (s) => {
    if (!s || !s.trim()) return;
    const key = s.trim().toLowerCase();
    if (!subjectCounts.has(key)) subjectCounts.set(key, { canonical: s.trim(), count: 0 });
    subjectCounts.get(key).count++;
  };
  tutorRows.forEach((t) => { bumpSubject(t.subject); (t.subjects || []).forEach(bumpSubject); });
  classRows.forEach((c) => bumpSubject(c.subject));

  let subjectList = Array.from(subjectCounts.values());
  if (q) {
    const ql = q.toLowerCase();
    subjectList = subjectList.filter((s) => s.canonical.toLowerCase().includes(ql));
  }
  subjectList.sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));
  const subjectSuggestions = subjectList.slice(0, take).map((s) => ({
    type: 'subject',
    value: s.canonical,
    displayText: s.canonical,
    count: s.count,
  }));

  let tutorSuggestions = [];
  if (q) {
    const tutors = await prisma.tutor.findMany({
      where: {
        ...baseFilter,
        OR: [
          { user: { fullName: { contains: q, mode: 'insensitive' } } },
          { subject: { contains: q, mode: 'insensitive' } },
          { subjects: { has: q } },
        ],
      },
      include: { user: { select: { fullName: true, student: { select: { avatar: true } } } } },
      take,
      orderBy: { rating: 'desc' },
    });
    tutorSuggestions = tutors.map((tutor) => ({
      type: 'tutor',
      id: tutor.id,
      name: tutor.user.fullName,
      subject: tutor.subject,
      displayText: tutor.subject ? `${tutor.user.fullName} — ${tutor.subject}` : tutor.user.fullName,
      avatar: tutor.avatar || tutor.user.student?.avatar || null,
    }));
  }

  return {
    subjects: subjectSuggestions,
    tutors: tutorSuggestions,
    suggestions: [...subjectSuggestions, ...tutorSuggestions],
  };
}

async function getTutorById(id) {
  const tutor = await prisma.tutor.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          student: { select: { avatar: true } },
        },
      },
      classes: { where: { status: 'ACTIVE' }, orderBy: { fees: 'asc' } },
    },
  });

  if (!tutor || tutor.isAvailable === false) throw appError('Tutor not found', 404);

  return {
    id: tutor.id,
    userId: tutor.userId,
    name: tutor.user.fullName,
    email: tutor.user.email,
    subject: tutor.subject,
    subjects: tutor.subjects,
    location: tutor.location,
    bio: tutor.bio,
    experience: tutor.experience,
    education: tutor.education,
    hourlyRate: tutor.hourlyRate,
    learningMode: tutor.learningMode,
    rating: tutor.rating,
    totalReviews: tutor.totalReviews,
    totalStudents: tutor.totalStudents,
    isVerified: tutor.isVerified,
    avatar: tutor.avatar || tutor.user.student?.avatar || null,
    phone: tutor.phone,
    address: tutor.address,
    qualifications: tutor.qualifications,
    classes: tutor.classes,
  };
}

module.exports = { searchTutors, getTutorSuggestions, getTutorById };
