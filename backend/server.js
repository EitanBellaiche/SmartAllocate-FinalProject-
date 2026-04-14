import express from "express";
import cors from "cors";

import resourceTypesRoutes from "./routes/resourceTypes.js";
import resourcesRoutes from "./routes/resources.js";
import bookingsRoutes from "./routes/bookings.js";
import availabilityRoutes from "./routes/availability.js";
import rulesRoutes from "./routes/rules.js";  
import resourceRequestsRoutes from "./routes/resourceRequests.js";
import announcementsRoutes from "./routes/announcements.js";
import usersRoutes from "./routes/users.js";
import userAvailabilityRoutes from "./routes/userAvailability.js";
import autoScheduleRoutes from "./routes/autoSchedule.js";
import schemaRoutes from "./routes/schema.js";
import ruleWizardRoutes from "./routes/ruleWizard.js";
import { env, getAllowedOrigins } from "./config/env.js";
import { processDueAutoScheduleJobs } from "./services/autoScheduleJobs.js";

console.log("➡ server.js LOADED");
console.log("➡ SERVER BASE PATH:", process.cwd());

const app = express();
const allowedOrigins = getAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

// GLOBAL LOGGER — כל בקשה שנכנסת
app.use((req, res, next) => {
  console.log(`📥 Incoming: ${req.method} ${req.url}`);
  next();
});

// ROUTES
app.use("/api/resource-types", resourceTypesRoutes);
app.use("/api/resources", resourcesRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/rules", rulesRoutes);           
app.use("/api/rules", ruleWizardRoutes);
app.use("/api/resource-requests", resourceRequestsRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/user-availability", userAvailabilityRoutes);
app.use("/api/auto-schedule", autoScheduleRoutes);
app.use("/api/schema", schemaRoutes);

app.listen(env.port, () => {
  console.log(`🚀 SmartAllocate backend running on port ${env.port}`);
  console.log("🌐 Allowed CORS origins:", allowedOrigins.join(", "));
});

// Auto schedule job runner (deadline-based scheduling)
let autoScheduleRunnerStarted = false;
function startAutoScheduleRunner() {
  if (autoScheduleRunnerStarted) return;
  autoScheduleRunnerStarted = true;

  let delayMs = 30_000;

  const loop = async () => {
    try {
      await processDueAutoScheduleJobs({ maxPerTick: 1 });
      delayMs = 30_000;
    } catch (err) {
      console.error("Auto schedule job runner failed:", err);
      delayMs = Math.min(delayMs * 2, 60_000);
    } finally {
      setTimeout(loop, delayMs);
    }
  };

  // Run once at boot, then keep polling.
  loop();
}

startAutoScheduleRunner();
