import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "check reminder times",
  { minutes: 1 },
  internal.reminders.checkAndSendReminders
);

export default crons;
