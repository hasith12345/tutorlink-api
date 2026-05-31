/**
 * TutorLink — Sri Lanka Tutor Seed Script (100 tutors)
 *
 * Generates 100 realistic tutors with:
 *  - Sri Lankan curriculum subjects Grade 6–13
 *  - Random classes, locations, and teaching modes
 *  - 65 APPROVED · 35 PENDING
 *  - All emails verified
 *  - CV and ID documents skipped; all other required fields populated
 *
 * Run:   node prisma/seed.js
 *
 * Password for ALL tutors:  TutorLK@1
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const PLAIN_PASSWORD = "TutorLK@1";

// ─── Sri Lanka Curriculum Subjects (Grade 6–13) ────────────────────────────
const SUBJECT_POOLS = {
  junior: [
    "Mathematics",
    "Science",
    "English Language",
    "Sinhala Language",
    "Tamil Language",
    "History",
    "Geography",
    "Civic Education",
    "Health & Physical Education",
    "Art & Craft",
    "Music",
  ],
  ol: [
    "Combined Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Commerce",
    "Accounting",
    "Business Studies",
    "Economics",
    "ICT",
    "Art",
    "Agriculture Science",
    "Engineering Technology",
    "Home Science",
    "Sinhala Language & Literature",
    "Tamil Language & Literature",
    "English Language",
    "Buddhist Studies",
    "Drama & Theatre",
  ],
  al_science: [
    "Combined Mathematics (A/L)",
    "Physics (A/L)",
    "Chemistry (A/L)",
    "Biology (A/L)",
  ],
  al_commerce: [
    "Economics (A/L)",
    "Business Studies (A/L)",
    "Accounting (A/L)",
  ],
  al_arts: [
    "History (A/L)",
    "Geography (A/L)",
    "Political Science (A/L)",
    "Logic & Scientific Method (A/L)",
    "Buddhist Civilization (A/L)",
    "Sinhala (A/L)",
    "Tamil (A/L)",
    "English (A/L)",
  ],
  al_tech: [
    "Engineering Technology (A/L)",
    "Bio Systems Technology (A/L)",
    "Science for Technology (A/L)",
  ],
};

// Subject specialisations: each entry defines a realistic tutor profile
const SPECIALISATIONS = [
  { group: "al_science",  primary: "Combined Mathematics (A/L)", extras: ["Combined Mathematics", "Mathematics"],        edu: "BSc Mathematics",    dept: "Mathematics" },
  { group: "al_science",  primary: "Physics (A/L)",              extras: ["Combined Mathematics (A/L)", "Science"],       edu: "BSc Physics",        dept: "Physics" },
  { group: "al_science",  primary: "Chemistry (A/L)",            extras: ["Chemistry", "Biology"],                        edu: "BSc Chemistry",      dept: "Chemistry" },
  { group: "al_science",  primary: "Biology (A/L)",              extras: ["Biology", "Chemistry"],                        edu: "BSc Biology",        dept: "Biology" },
  { group: "al_commerce", primary: "Economics (A/L)",            extras: ["Business Studies (A/L)", "Economics"],         edu: "BA Economics",       dept: "Economics" },
  { group: "al_commerce", primary: "Accounting (A/L)",           extras: ["Commerce", "Accounting"],                      edu: "BCom Accountancy",   dept: "Accounting" },
  { group: "al_commerce", primary: "Business Studies (A/L)",     extras: ["Economics (A/L)", "Commerce"],                 edu: "BBA",                dept: "Business" },
  { group: "al_arts",     primary: "History (A/L)",              extras: ["Geography (A/L)", "History"],                  edu: "BA History",         dept: "History" },
  { group: "al_arts",     primary: "Geography (A/L)",            extras: ["History", "Civic Education"],                  edu: "BSc Geography",      dept: "Geography" },
  { group: "al_arts",     primary: "Political Science (A/L)",    extras: ["History (A/L)", "Civic Education"],            edu: "BA Political Science", dept: "Politics" },
  { group: "al_tech",     primary: "Engineering Technology (A/L)", extras: ["ICT", "Science for Technology (A/L)"],       edu: "BEng Engineering",   dept: "Engineering" },
  { group: "al_tech",     primary: "Bio Systems Technology (A/L)", extras: ["Biology (A/L)", "Agriculture Science"],      edu: "BSc Bio Systems",    dept: "Bio Systems" },
  { group: "ol",          primary: "Combined Mathematics",        extras: ["Mathematics", "Science"],                      edu: "BSc Mathematics",    dept: "Mathematics" },
  { group: "ol",          primary: "Physics",                     extras: ["Combined Mathematics", "Science"],             edu: "BSc Physics",        dept: "Physics" },
  { group: "ol",          primary: "Chemistry",                   extras: ["Biology", "Science"],                          edu: "BSc Chemistry",      dept: "Chemistry" },
  { group: "ol",          primary: "Biology",                     extras: ["Chemistry", "Health & Physical Education"],    edu: "BSc Biology",        dept: "Biology" },
  { group: "ol",          primary: "ICT",                         extras: ["Engineering Technology", "Science"],           edu: "BSc IT",             dept: "IT" },
  { group: "ol",          primary: "Commerce",                    extras: ["Accounting", "Economics"],                     edu: "BCom",               dept: "Commerce" },
  { group: "ol",          primary: "Agriculture Science",         extras: ["Bio Systems Technology (A/L)", "Biology"],     edu: "BSc Agriculture",    dept: "Agriculture" },
  { group: "junior",      primary: "Mathematics",                 extras: ["Science", "Combined Mathematics"],             edu: "BSc Mathematics",    dept: "Mathematics" },
  { group: "junior",      primary: "Science",                     extras: ["Health & Physical Education", "Biology"],      edu: "BSc Applied Science", dept: "Science" },
  { group: "junior",      primary: "English Language",            extras: ["Sinhala Language", "Drama & Theatre"],         edu: "BA English",         dept: "English" },
  { group: "junior",      primary: "Sinhala Language",            extras: ["Sinhala Language & Literature", "History"],    edu: "BA Sinhala",         dept: "Sinhala" },
  { group: "junior",      primary: "Tamil Language",              extras: ["Tamil Language & Literature", "History"],      edu: "BA Tamil",           dept: "Tamil" },
  { group: "junior",      primary: "Art & Craft",                 extras: ["Art", "Drama & Theatre"],                      edu: "BA Fine Arts",       dept: "Arts" },
];

const SL_LOCATIONS = [
  "Colombo", "Kandy", "Galle", "Matara", "Kurunegala", "Negombo",
  "Jaffna", "Trincomalee", "Anuradhapura", "Ratnapura", "Badulla",
  "Nuwara Eliya", "Kalutara", "Gampaha", "Batticaloa", "Hambantota",
  "Ampara", "Polonnaruwa", "Vavuniya", "Kegalle",
];

const UNIVERSITIES = {
  "Mathematics":  ["University of Colombo", "University of Peradeniya", "University of Kelaniya", "Sabaragamuwa University"],
  "Physics":      ["University of Colombo", "University of Peradeniya", "University of Kelaniya"],
  "Chemistry":    ["University of Colombo", "University of Peradeniya", "University of Sri Jayewardenepura"],
  "Biology":      ["University of Peradeniya", "University of Ruhuna", "University of Kelaniya"],
  "Economics":    ["University of Colombo", "University of Sri Jayewardenepura", "University of Peradeniya"],
  "Accounting":   ["University of Sri Jayewardenepura", "University of Kelaniya", "SLIIT"],
  "Business":     ["University of Colombo", "NSBM Green University", "SLIIT"],
  "History":      ["University of Peradeniya", "University of Kelaniya", "University of Jaffna"],
  "Geography":    ["Sabaragamuwa University", "University of Ruhuna", "University of Peradeniya"],
  "Politics":     ["University of Colombo", "University of Peradeniya", "Eastern University"],
  "Engineering":  ["University of Moratuwa", "University of Peradeniya", "SLIIT"],
  "Bio Systems":  ["University of Ruhuna", "Sabaragamuwa University", "University of Peradeniya"],
  "IT":           ["UCSC Colombo", "SLIIT", "University of Moratuwa"],
  "Commerce":     ["University of Sri Jayewardenepura", "University of Kelaniya", "NSBM"],
  "Agriculture":  ["University of Ruhuna", "Sabaragamuwa University", "Wayamba University"],
  "Science":      ["University of Kelaniya", "University of Ruhuna", "University of Sri Jayewardenepura"],
  "English":      ["University of Colombo", "University of Kelaniya", "University of Peradeniya"],
  "Sinhala":      ["University of Peradeniya", "University of Kelaniya", "University of Sri Jayewardenepura"],
  "Tamil":        ["University of Jaffna", "Eastern University", "University of Peradeniya"],
  "Arts":         ["University of Visual & Performing Arts", "Eastern University", "University of Peradeniya"],
};

const MALE_FIRST_NAMES = [
  "Kasun","Nuwan","Chamara","Dilshan","Ruwan","Amal","Kavindu","Tharanga","Roshan",
  "Pradeep","Lahiru","Isuru","Damith","Gayan","Hasitha","Sampath","Janaka","Prasad",
  "Sanjeewa","Thilak","Malith","Hirantha","Chathura","Dimuth","Supun","Asanka",
  "Madushan","Chamindu","Thivanka","Sahan","Pubudu","Ravindu","Oshada","Nethmin",
  "Dinuka","Suresh","Arjun","Kumar","Murali","Vijay","Mohamed","Farook","Rizwan",
  "Imran","Hassan","Nimal","Thiru","Selvam","Raghu","Prashant",
];

const FEMALE_FIRST_NAMES = [
  "Sanduni","Malini","Thilini","Priya","Sachini","Dilini","Nadeeka","Fathima",
  "Nimasha","Imesha","Harshani","Vindya","Chanudi","Madhavi","Hiruni","Kanchana",
  "Roshani","Dulani","Nawodya","Sithara","Yasara","Lasuni","Chathurika","Dinusha",
  "Tharushika","Priyanka","Lalitha","Kavitha","Meena","Saranya","Thilaga","Nanthini",
  "Yamuna","Rizna","Aisha","Zuhra","Nushrath","Dilshani","Shanika","Kumari",
  "Amali","Iresha","Upeksha","Nadeesha","Samanthi","Menaka","Renuka","Savindi",
  "Chamodi","Thisuri",
];

const LAST_NAMES = [
  "Perera","Fernando","Silva","Jayawardena","Bandara","Wickramasinghe","Dissanayake",
  "Rajapaksha","Gunasekara","Herath","Seneviratne","Pathirana","Ranasinghe",
  "Madushanka","Almeida","De Silva","Mendis","Wijesinghe","Kumarasinghe","Fonseka",
  "Weerasinghe","Samarasinghe","Rathnayake","Gamage","Dias","Rodrigo","Liyanage",
  "Kumara","Vithanage","Siriwardena","Abeywickrama","Balasingham","Chandrasekaram",
  "Arumugam","Thangarajah","Ramasamy","Shanmuganathan","Rizvi","Hashim","Niyas",
  "Thilakasiri","Jayasena","Weerasooriya","Kodippili","Nair","Kumar","Jabir",
  "Subramaniam","Sivanandan","Karunanayake",
];

const MODES = ["online", "physical", "hybrid"];
const TIMES = ["7:00 AM","8:30 AM","10:00 AM","2:00 PM","3:30 PM","5:00 PM","6:30 PM"];
const DURATIONS = ["1 hour","1.5 hours","2 hours"];
const DAYS = ["MON","TUE","WED","THU","FRI","SAT","SUN"];

// ─── Helpers ───────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max, dp = 1) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dp));

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, ".");
}

function generateAddress(location) {
  const num = randInt(1, 200);
  const roads = [
    "Galle Road","Kandy Road","Colombo Road","Main Street","High Level Road",
    "Hospital Road","Temple Road","Railway Road","Lake Road","New Road",
  ];
  return `${num} ${pick(roads)}, ${location}`;
}

function generateDob() {
  const year = randInt(1978, 1999);
  const month = String(randInt(1, 12)).padStart(2, "0");
  const day = String(randInt(1, 28)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateNIC(dob) {
  const year = dob.substring(2, 4);
  const serial = String(randInt(1000000, 9999999));
  return `${year}${serial}V`;
}

function generatePhone() {
  const prefixes = ["077","071","072","076","070","078","021","026","041","045"];
  return `${pick(prefixes)}${String(randInt(1000000, 9999999))}`;
}

function generateBio(spec, experience, location) {
  const templates = [
    `${spec.primary} tutor with ${experience} of experience based in ${location}. Focused on exam preparation and concept clarity for Sri Lankan curriculum students.`,
    `Dedicated ${spec.dept} tutor helping Grade 6–13 students excel in ${spec.primary}. Proven track record with O/L and A/L past paper strategies.`,
    `Experienced educator specialising in ${spec.primary}. Structured lessons tailored to the Sri Lankan national curriculum with strong emphasis on examination techniques.`,
    `Passionate ${spec.dept} teacher with ${experience} in the field. Making ${spec.primary} accessible and engaging for students at every level.`,
    `Results-driven ${spec.primary} tutor based in ${location}. Individual attention, systematic revision, and full syllabus coverage for guaranteed improvement.`,
  ];
  return pick(templates);
}

function generateQualifications(spec, university) {
  const extras = [
    "Registered Teacher, Ministry of Education",
    "Postgraduate Diploma in Education, OUSL",
    "PGDE, University of Colombo",
    "Diploma in Education, University of Peradeniya",
    "Former Senior Teacher, National School",
    "Examiner, Department of Examinations Sri Lanka",
    "Visiting Lecturer, SLIIT",
    "Curriculum Developer, NIE Sri Lanka",
  ];
  return `${spec.edu}, ${university} | ${pick(extras)}`;
}

function generateClasses(tutorId, subjects, location, mode) {
  const count = Math.min(subjects.length, randInt(1, 3));
  return subjects.slice(0, count).map((subject) => {
    const classMode = mode === "hybrid" ? pick(["online", "physical"]) : mode;
    const schedule = pickN(DAYS, randInt(2, 3));
    const fees = randInt(4, 14) * 500; // 2000–7000 LKR

    return {
      subject,
      description: `${subject} classes for Sri Lankan curriculum (Grade 6–13). Comprehensive coverage with past paper practice and model answers.`,
      mode: classMode,
      location: classMode === "physical" ? location : null,
      venue: classMode === "physical" ? `${location} Teaching Centre` : null,
      meetingLink:
        classMode === "online"
          ? `https://meet.google.com/tl-${Math.random().toString(36).slice(2, 8)}`
          : null,
      date: new Date(),
      schedule,
      time: pick(TIMES),
      duration: pick(DURATIONS),
      fees,
      maxStudents: pick([8, 10, 12, 15, 20, 25]),
      enrolledCount: 0,
      status: "ACTIVE",
    };
  });
}

// ─── Generate 100 Tutor Definitions ───────────────────────────────────────
function buildTutorList() {
  const usedEmails = new Set();
  const usedNames = new Set();
  const tutors = [];

  // 65 APPROVED, 35 PENDING
  const statuses = [
    ...Array(65).fill("APPROVED"),
    ...Array(35).fill("PENDING"),
  ];

  const allFirstNames = [...MALE_FIRST_NAMES, ...FEMALE_FIRST_NAMES];

  for (let i = 0; i < 100; i++) {
    const spec = SPECIALISATIONS[i % SPECIALISATIONS.length];
    const status = statuses[i];

    // Unique full name
    let fullName;
    let attempts = 0;
    do {
      fullName = `${pick(allFirstNames)} ${pick(LAST_NAMES)}`;
      attempts++;
      if (attempts > 50) fullName = `${pick(allFirstNames)} ${pick(LAST_NAMES)} ${i}`;
    } while (usedNames.has(fullName) && attempts < 100);
    usedNames.add(fullName);

    // Unique email
    let email;
    let emailAttempts = 0;
    do {
      const slug = slugify(fullName);
      email = emailAttempts === 0
        ? `${slug}@tutorlink.lk`
        : `${slug}.${emailAttempts}@tutorlink.lk`;
      emailAttempts++;
    } while (usedEmails.has(email));
    usedEmails.add(email);

    const location = pick(SL_LOCATIONS);
    const mode = pick(MODES);
    const experience = `${randInt(2, 20)} years`;
    const dob = generateDob();
    const university = pick(UNIVERSITIES[spec.dept] || ["University of Sri Jayewardenepura"]);

    const isApproved = status === "APPROVED";
    const rating = isApproved ? randFloat(3.8, 5.0, 1) : 0;
    const totalReviews = isApproved ? randInt(10, 350) : 0;
    const totalStudents = isApproved ? randInt(8, 250) : 0;

    tutors.push({
      fullName,
      email,
      dob,
      phone: generatePhone(),
      address: generateAddress(location),
      location,
      idNumber: generateNIC(dob),
      subject: spec.primary,
      subjects: [spec.primary, ...spec.extras],
      bio: generateBio(spec, experience, location),
      experience,
      education: `${spec.edu}, ${university}`,
      qualifications: generateQualifications(spec, university),
      learningMode: mode,
      hourlyRate: randInt(6, 20) * 500, // 3000–10000 LKR
      rating,
      totalReviews,
      totalStudents,
      applicationStatus: status,
      isVerified: isApproved ? Math.random() > 0.2 : false, // 80% of approved are verified
    });
  }

  return tutors;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("⏳  Hashing password...");
  const hashedPassword = await bcrypt.hash(PLAIN_PASSWORD, 10);

  const tutorList = buildTutorList();
  const credentials = [];
  let skipped = 0;

  for (const data of tutorList) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      console.log(`⚠️  Skipping ${data.email} — already exists`);
      skipped++;
      continue;
    }

    const user = await prisma.user.create({
      data: {
        fullName: data.fullName,
        email: data.email,
        password: hashedPassword,
        isEmailVerified: true,
      },
    });

    const tutor = await prisma.tutor.create({
      data: {
        userId: user.id,
        dob: data.dob,
        phone: data.phone,
        address: data.address,
        location: data.location,
        idNumber: data.idNumber,
        subject: data.subject,
        subjects: data.subjects,
        bio: data.bio,
        experience: data.experience,
        education: data.education,
        qualifications: data.qualifications,
        learningMode: data.learningMode,
        hourlyRate: data.hourlyRate,
        rating: data.rating,
        totalReviews: data.totalReviews,
        totalStudents: data.totalStudents,
        applicationStatus: data.applicationStatus,
        isVerified: data.isVerified,
        isAvailable: true,
        lastOnlineAt: data.applicationStatus === "APPROVED" ? new Date() : null,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(data.fullName)}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
      },
    });

    const classes = generateClasses(tutor.id, data.subjects, data.location, data.learningMode);
    for (const cls of classes) {
      await prisma.class.create({ data: { tutorId: tutor.id, ...cls } });
    }

    credentials.push({
      name: data.fullName,
      email: data.email,
      status: data.applicationStatus,
      location: data.location,
      subject: data.subject,
      classes: classes.length,
    });

    const icon = data.applicationStatus === "APPROVED" ? "✅" : "🟡";
    console.log(`${icon} [${String(credentials.length).padStart(3, "0")}] ${data.fullName.padEnd(30)} ${data.applicationStatus.padEnd(8)} — ${classes.length} class(es) | ${data.location}`);
  }

  // ── Credentials Table ───────────────────────────────────────────────────
  const line = "─".repeat(90);
  console.log(`\n┌${line}┐`);
  console.log(`│${"  SEEDED TUTOR CREDENTIALS".padEnd(90)}│`);
  console.log(`│${"  Password (all tutors): TutorLK@1".padEnd(90)}│`);
  console.log(`├${"─".repeat(45)}┬${"─".repeat(12)}┬${"─".repeat(32)}┤`);
  console.log(`│ ${"Email".padEnd(43)} │ ${"Status".padEnd(10)} │ ${"Main Subject".padEnd(30)} │`);
  console.log(`├${"─".repeat(45)}┬${"─".repeat(12)}┬${"─".repeat(32)}┤`);

  for (const c of credentials) {
    const email = c.email.padEnd(43);
    const status = c.status.padEnd(10);
    const subject = c.subject.slice(0, 30).padEnd(30);
    console.log(`│ ${email} │ ${status} │ ${subject} │`);
  }

  console.log(`└${"─".repeat(45)}┴${"─".repeat(12)}┴${"─".repeat(32)}┘`);

  const approved = credentials.filter((c) => c.status === "APPROVED").length;
  const pending = credentials.filter((c) => c.status === "PENDING").length;
  console.log(`\n✔  ${credentials.length} tutors seeded  (${approved} APPROVED · ${pending} PENDING)${skipped > 0 ? `  ·  ${skipped} skipped` : ""}\n`);
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
