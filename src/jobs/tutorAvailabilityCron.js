const cron = require("node-cron");
const { prisma } = require("../models");

const INACTIVE_THRESHOLD_DAYS = 30;

// Core job logic — exported so it can also be triggered manually for testing
async function runTutorAvailabilitySweep() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[tutorAvailabilityCron] Sweep started at ${now.toISOString()} — cutoff: ${cutoff.toISOString()}`);

  // Mark tutors inactive if they haven't visited their dashboard in 30+ days.
  // Tutors that never logged in (lastOnlineAt = null) but were just created are exempt for their first 30 days.
  const inactiveResult = await prisma.tutor.updateMany({
    where: {
      isAvailable: true,
      OR: [
        { lastOnlineAt: { lt: cutoff } },
        { AND: [{ lastOnlineAt: null }, { createdAt: { lt: cutoff } }] },
      ],
    },
    data: { isAvailable: false },
  });

  // Reactivate any tutors who came back online within the window but were marked inactive
  const activeResult = await prisma.tutor.updateMany({
    where: {
      isAvailable: false,
      lastOnlineAt: { gte: cutoff },
    },
    data: { isAvailable: true },
  });

  console.log(
    `[tutorAvailabilityCron] Done. Marked inactive: ${inactiveResult.count}, reactivated: ${activeResult.count}`
  );

  return { inactiveCount: inactiveResult.count, reactivatedCount: activeResult.count };
}

// Schedule: every day at 2:00 AM (server timezone)
function startTutorAvailabilityCron() {
  cron.schedule(
    "0 2 * * *",
    () => {
      runTutorAvailabilitySweep().catch((err) =>
        console.error("[tutorAvailabilityCron] Sweep failed:", err)
      );
    },
    { timezone: process.env.TZ || "Asia/Colombo" }
  );
  console.log("[tutorAvailabilityCron] Scheduled — runs daily at 02:00");
}

module.exports = { startTutorAvailabilityCron, runTutorAvailabilitySweep };
