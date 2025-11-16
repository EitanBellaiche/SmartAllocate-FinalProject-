require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const resourceTypesRoute = require("./routes/resourceTypes");
const resourcesRoute = require("./routes/resources");
const availabilityRoute = require("./routes/availability");
const bookingsRoute = require("./routes/bookings");
const usersRoute = require("./routes/users");




const app = express();
app.use(cors());
app.use(express.json());

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'SmartAllocate API is running!' });
});

// Test DB connection
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ time: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use("/api/resource-types", resourceTypesRoute);
app.use("/api/resources", resourcesRoute);
app.use("/api/availability", availabilityRoute);
app.use("/api/bookings", bookingsRoute);
app.use("/api/users", usersRoute);



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SmartAllocate backend running on port ${PORT}`);
});
