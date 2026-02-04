const { prisma } = require("../models");

/**
 * Search tutors by subject, location, and learning mode
 */
exports.searchTutors = async (req, res) => {
  try {
    const { subject, location, learningMode, limit = 50 } = req.query;

    // Build search filters
    const filters = {
      isAvailable: true,
    };

    // Search in subject or subjects array
    if (subject && subject.trim()) {
      filters.OR = [
        {
          subject: {
            contains: subject,
            mode: "insensitive",
          },
        },
        {
          subjects: {
            hasSome: [subject],
          },
        },
        {
          user: {
            fullName: {
              contains: subject,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    // Filter by location
    if (location && location.trim()) {
      filters.location = {
        contains: location,
        mode: "insensitive",
      };
    }

    // Filter by learning mode
    if (learningMode && ["online", "physical", "hybrid"].includes(learningMode)) {
      filters.learningMode = learningMode;
    }

    // Fetch tutors with user data
    const tutors = await prisma.tutor.findMany({
      where: filters,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
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
      avatar: tutor.avatar,
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

    if (!query || query.trim().length === 0) {
      return res.status(200).json({
        success: true,
        suggestions: [],
      });
    }

    // Search tutors by name or subject
    const tutors = await prisma.tutor.findMany({
      where: {
        isAvailable: true,
        OR: [
          {
            subject: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            subjects: {
              hasSome: [query],
            },
          },
          {
            user: {
              fullName: {
                contains: query,
                mode: "insensitive",
              },
            },
          },
        ],
      },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
      },
      take: parseInt(limit),
      orderBy: {
        rating: "desc",
      },
    });

    // Format suggestions
    const suggestions = tutors.map((tutor) => ({
      id: tutor.id,
      name: tutor.user.fullName,
      subject: tutor.subject,
      displayText: `${tutor.subject} - ${tutor.user.fullName}`,
      avatar: tutor.avatar,
    }));

    res.status(200).json({
      success: true,
      suggestions,
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
          },
        },
      },
    });

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
        avatar: tutor.avatar,
        phone: tutor.phone,
        address: tutor.address,
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
