import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import resourceTypesRoutes from "./routes/resourceTypes.js";
import resourcesRoutes from "./routes/resources.js";
import bookingsRoutes from "./routes/bookings.js";
import availabilityRoutes from "./routes/availability.js";
import rulesRoutes from "./routes/rules.js";  
import resourceRequestsRoutes from "./routes/resourceRequests.js";
import announcementsRoutes from "./routes/announcements.js";
import usersRoutes from "./routes/users.js";

dotenv.config();

console.log("➡ server.js LOADED");
console.log("➡ SERVER BASE PATH:", process.cwd());

const app = express();
app.use(cors());
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
app.use("/api/resource-requests", resourceRequestsRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/users", usersRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 SmartAllocate backend running on port ${PORT}`);
});
