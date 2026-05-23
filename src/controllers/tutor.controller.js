const { prisma } = require("../models");

/**
 * Search tutors by subject, location, and learning mode
 */
exports.searchTutors = async (req, res) => {
  try {
    const { subject, location, learningMode, limit = 50 } = req.query;

    // Build search filters — only show APPROVED tutors who have at least one active class
    // Combine status + mode into one classes.some filter so they stack correctly
    const classFilter = { status: "ACTIVE" };
    if (learningMode && ["online", "physical", "hybrid"].includes(learningMode)) {
      classFilter.mode = learningMode;
    }

    const filters = {
      isAvailable: true,
      applicationStatus: "APPROVED",
      classes: { some: classFilter },
    };

    // Search across tutor name, subject field, subjects[] array, and class subjects
    if (subject && subject.trim()) {
      const q = subject.trim();
      filters.OR = [
        { subject: { contains: q, mode: "insensitive" } },
        { subjects: { has: q } },
        { user: { fullName: { contains: q, mode: "insensitive" } } },
        { classes: { some: { ...classFilter, subject: { contains: q, mode: "insensitive" } } } },
      ];
    }

    // Filter by location
    if (location && location.trim()) {
      filters.location = {
        contains: location,
        mode: "insensitive",
      };
    }

    // Fetch tutors with user data
    const tutors = await prisma.tutor.findMany({
      where: filters,
      include: {
        user: {
          select: {
            id: true, fullName: true, email: true,
            student: { select: { avatar: true } },
          },
        },
        classes: {
          where: { status: "ACTIVE" },
          orderBy: { fees: "asc" },
        },
      },
      take: parseInt(limit),
      orderBy: [
        { rating: "desc" },
        { totalStudents: "desc" },
      ],
    });

    // Format response
    const formattedTutors = tutors.map((tutor) => ({
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
      lowestFee: tutor.classes.length > 0 ? Math.min(...tutor.classes.map(c => c.fees)) : null,
    }));

    res.status(200).json({
      success: true,
      count: formattedTutors.length,
      tutors: formattedTutors,
    });
  } catch (error) {
    console.error("Search tutors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search tutors",
      error: error.message,
    });
  }
};

/**
 * Get tutor suggestions for autocomplete
 */
exports.getTutorSuggestions = async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    const q = (query || "").trim();
    const take = parseInt(limit);

    // Only suggest from APPROVED + active tutors (matches search behavior)
    const baseFilter = {
      isAvailable: true,
      applicationStatus: "APPROVED",
      classes: { some: { status: "ACTIVE" } },
    };

    // 1. SUBJECT suggestions — distinct list from tutor.subject, tutor.subjects[], class.subject
    //    Aggregate from the DB then dedupe/filter client-side by case-insensitive match
    const [tutorRows, classRows] = await Promise.all([
      prisma.tutor.findMany({
        where: baseFilter,
        select: { subject: true, subjects: true },
      }),
      prisma.class.findMany({
        where: { status: "ACTIVE", tutor: baseFilter },
        select: { subject: true },
      }),
    ]);

    const subjectCounts = new Map(); // key = lowercase, val = { canonical, count }
    const bumpSubject = (s) => {
      if (!s || !s.trim()) return;
      const key = s.trim().toLowerCase();
      if (!subjectCounts.has(key)) subjectCounts.set(key, { canonical: s.trim(), count: 0 });
      subjectCounts.get(key).count++;
    };
    tutorRows.forEach((t) => {
      bumpSubject(t.subject);
      (t.subjects || []).forEach(bumpSubject);
    });
    classRows.forEach((c) => bumpSubject(c.subject));

    let subjectList = Array.from(subjectCounts.values());
    if (q) {
      const ql = q.toLowerCase();
      subjectList = subjectList.filter((s) => s.canonical.toLowerCase().includes(ql));
    }
    subjectList.sort((a, b) => b.count - a.count || a.canonical.localeCompare(b.canonical));
    const subjectSuggestions = subjectList.slice(0, take).map((s) => ({
      type: "subject",
      value: s.canonical,
      displayText: s.canonical,
      count: s.count,
    }));

    // 2. TUTOR suggestions — only when there's a query (avoid dumping every tutor)
    let tutorSuggestions = [];
    if (q) {
      const tutors = await prisma.tutor.findMany({
        where: {
          ...baseFilter,
          OR: [
            { user: { fullName: { contains: q, mode: "insensitive" } } },
            { subject: { contains: q, mode: "insensitive" } },
            { subjects: { has: q } },
          ],
        },
        include: {
          user: {
            select: {
              fullName: true,
              student: { select: { avatar: true } },
            },
          },
        },
        take,
        orderBy: { rating: "desc" },
      });
      tutorSuggestions = tutors.map((tutor) => ({
        type: "tutor",
        id: tutor.id,
        name: tutor.user.fullName,
        subject: tutor.subject,
        displayText: tutor.subject ? `${tutor.user.fullName} — ${tutor.subject}` : tutor.user.fullName,
        avatar: tutor.avatar || tutor.user.student?.avatar || null,
      }));
    }

    res.status(200).json({
      success: true,
      subjects: subjectSuggestions,
      tutors: tutorSuggestions,
      // Backward-compatible flat list (existing frontend reads this)
      suggestions: [...subjectSuggestions, ...tutorSuggestions],
    });
  } catch (error) {
    console.error("Get suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get suggestions",
      error: error.message,
    });
  }
};

/**
 * Get tutor by ID
 */
exports.getTutorById = async (req, res) => {
  try {
    const { id } = req.params;

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
        classes: {
          where: { status: "ACTIVE" },
          orderBy: { fees: "asc" },
        },
      },
    });

    // Hide tutors that are inactive (haven't visited dashboard in 30+ days) — treat as not found
    if (tutor && tutor.isAvailable === false) {
      return res.status(404).json({ success: false, message: "Tutor not found" });
    }

    if (!tutor) {
      return res.status(404).json({
        success: false,
        message: "Tutor not found",
      });
    }

    res.status(200).json({
      success: true,
      tutor: {
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
      },
    });
  } catch (error) {
    console.error("Get tutor error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tutor",
      error: error.message,
    });
  }
};

/**
 * Seed mock tutor data (for development/testing)
 */
exports.seedMockTutors = async (req, res) => {
  try {
    const mockTutors = [
      {
        fullName: "Sarah Johnson",
        email: "sarah.johnson@tutorlink.com",
        subject: "Mathematics",
        subjects: ["Mathematics", "Algebra", "Calculus"],
        location: "New York",
        learningMode: "hybrid",
        bio: "Experienced math tutor with a passion for making complex concepts easy to understand.",
        experience: "8 years",
        education: "Masters in Mathematics Education",
        hourlyRate: 5000,
        rating: 4.8,
        totalReviews: 145,
        totalStudents: 87,
        isVerified: true,
      },
      {
        fullName: "Michael Chen",
        email: "michael.chen@tutorlink.com",
        subject: "Physics",
        subjects: ["Physics", "Mechanics", "Thermodynamics"],
        location: "Los Angeles",
        learningMode: "online",
        bio: "Physics PhD with 10+ years of teaching experience at university level.",
        experience: "10 years",
        education: "PhD in Physics",
        hourlyRate: 6000,
        rating: 4.9,
        totalReviews: 203,
        totalStudents: 124,
        isVerified: true,
      },
      {
        fullName: "Emily Davis",
        email: "emily.davis@tutorlink.com",
        subject: "Chemistry",
        subjects: ["Chemistry", "Organic Chemistry", "Biochemistry"],
        location: "Chicago",
        learningMode: "physical",
        bio: "Dedicated chemistry tutor helping students ace their exams.",
        experience: "5 years",
        education: "BSc in Chemistry",
        hourlyRate: 4500,
        rating: 4.7,
        totalReviews: 98,
        totalStudents: 65,
        isVerified: true,
      },
      {
        fullName: "James Wilson",
        email: "james.wilson@tutorlink.com",
        subject: "English",
        subjects: ["English", "Literature", "Writing"],
        location: "Houston",
        learningMode: "hybrid",
        bio: "English literature expert with a focus on creative writing and essay composition.",
        experience: "7 years",
        education: "MA in English Literature",
        hourlyRate: 4000,
        rating: 4.6,
        totalReviews: 112,
        totalStudents: 78,
        isVerified: true,
      },
      {
        fullName: "Emma Brown",
        email: "emma.brown@tutorlink.com",
        subject: "Biology",
        subjects: ["Biology", "Genetics", "Ecology"],
        location: "Phoenix",
        learningMode: "online",
        bio: "Biology teacher with hands-on experience in genetics research.",
        experience: "6 years",
        education: "MSc in Biology",
        hourlyRate: 4800,
        rating: 4.7,
        totalReviews: 134,
        totalStudents: 92,
        isVerified: true,
      },
      {
        fullName: "David Lee",
        email: "david.lee@tutorlink.com",
        subject: "Computer Science",
        subjects: ["Computer Science", "Programming", "Web Development"],
        location: "San Francisco",
        learningMode: "online",
        bio: "Software engineer turned educator, specializing in coding and web development.",
        experience: "9 years",
        education: "BSc in Computer Science",
        hourlyRate: 7000,
        rating: 4.9,
        totalReviews: 187,
        totalStudents: 156,
        isVerified: true,
      },
      {
        fullName: "Olivia Martinez",
        email: "olivia.martinez@tutorlink.com",
        subject: "History",
        subjects: ["History", "World History", "US History"],
        location: "Boston",
        learningMode: "physical",
        bio: "History enthusiast making the past come alive for students.",
        experience: "4 years",
        education: "BA in History",
        hourlyRate: 3800,
        rating: 4.5,
        totalReviews: 76,
        totalStudents: 54,
        isVerified: false,
      },
      {
        fullName: "Daniel Taylor",
        email: "daniel.taylor@tutorlink.com",
        subject: "Economics",
        subjects: ["Economics", "Microeconomics", "Macroeconomics"],
        location: "Seattle",
        learningMode: "hybrid",
        bio: "Economics professor with real-world business consulting experience.",
        experience: "12 years",
        education: "PhD in Economics",
        hourlyRate: 6500,
        rating: 4.8,
        totalReviews: 156,
        totalStudents: 103,
        isVerified: true,
      },
      {
        fullName: "Sophia Anderson",
        email: "sophia.anderson@tutorlink.com",
        subject: "Spanish",
        subjects: ["Spanish", "French", "Italian"],
        location: "Miami",
        learningMode: "online",
        bio: "Native Spanish speaker with experience teaching multiple languages.",
        experience: "6 years",
        education: "BA in Linguistics",
        hourlyRate: 4200,
        rating: 4.7,
        totalReviews: 121,
        totalStudents: 89,
        isVerified: true,
      },
      {
        fullName: "Ryan Thompson",
        email: "ryan.thompson@tutorlink.com",
        subject: "Music",
        subjects: ["Music", "Piano", "Guitar"],
        location: "Nashville",
        learningMode: "physical",
        bio: "Professional musician and certified music instructor.",
        experience: "10 years",
        education: "Bachelor of Music",
        hourlyRate: 5500,
        rating: 4.9,
        totalReviews: 167,
        totalStudents: 112,
        isVerified: true,
      },
    ];

    const createdTutors = [];
    const password = "$2a$10$YourHashedPasswordHere"; // You should hash this properly

    for (const mockData of mockTutors) {
      // Check if user already exists
      let user = await prisma.user.findUnique({
        where: { email: mockData.email },
      });

      // Create user if doesn't exist
      if (!user) {
        user = await prisma.user.create({
          data: {
            fullName: mockData.fullName,
            email: mockData.email,
            password: password,
            isEmailVerified: true,
          },
        });
      }

      // Check if tutor profile exists
      let tutor = await prisma.tutor.findUnique({
        where: { userId: user.id },
      });

      // Create or update tutor profile
      if (!tutor) {
        tutor = await prisma.tutor.create({
          data: {
            userId: user.id,
            subject: mockData.subject,
            subjects: mockData.subjects,
            location: mockData.location,
            learningMode: mockData.learningMode,
            bio: mockData.bio,
            experience: mockData.experience,
            education: mockData.education,
            hourlyRate: mockData.hourlyRate,
            rating: mockData.rating,
            totalReviews: mockData.totalReviews,
            totalStudents: mockData.totalStudents,
            isVerified: mockData.isVerified,
            isAvailable: true,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(mockData.fullName)}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
          },
        });
      } else {
        tutor = await prisma.tutor.update({
          where: { userId: user.id },
          data: {
            subject: mockData.subject,
            subjects: mockData.subjects,
            location: mockData.location,
            learningMode: mockData.learningMode,
            bio: mockData.bio,
            experience: mockData.experience,
            education: mockData.education,
            hourlyRate: mockData.hourlyRate,
            rating: mockData.rating,
            totalReviews: mockData.totalReviews,
            totalStudents: mockData.totalStudents,
            isVerified: mockData.isVerified,
            isAvailable: true,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(mockData.fullName)}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
          },
        });
      }

      createdTutors.push({
        user: {
          id: user.id,
          name: user.fullName,
          email: user.email,
        },
        tutor: {
          id: tutor.id,
          subject: tutor.subject,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully seeded ${createdTutors.length} tutors`,
      tutors: createdTutors,
    });
  } catch (error) {
    console.error("Seed tutors error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to seed tutors",
      error: error.message,
    });
  }
};
