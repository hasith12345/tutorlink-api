// Load environment variables first
require("dotenv").config();

const { prisma } = require("./src/models");

async function seedTutors() {
  try {
    console.log("Starting to seed mock tutors...");

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
    const bcrypt = require("bcryptjs");
    const password = await bcrypt.hash("TutorDemo123!", 10);

    for (const mockData of mockTutors) {
      console.log(`Processing tutor: ${mockData.fullName}...`);

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
        console.log(`  ✓ Created user: ${user.email}`);
      } else {
        console.log(`  ℹ User already exists: ${user.email}`);
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
        console.log(`  ✓ Created tutor profile for: ${mockData.fullName}`);
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
        console.log(`  ✓ Updated tutor profile for: ${mockData.fullName}`);
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

    console.log(`\n✅ Successfully seeded ${createdTutors.length} tutors!`);
    console.log("\nTutors created:");
    createdTutors.forEach((t, i) => {
      console.log(`${i + 1}. ${t.user.name} (${t.tutor.subject}) - ${t.user.email}`);
    });

    return createdTutors;
  } catch (error) {
    console.error("❌ Error seeding tutors:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedTutors()
  .then(() => {
    console.log("\n✨ Seeding completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Seeding failed:", error);
    process.exit(1);
  });
