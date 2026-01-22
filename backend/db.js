
import pkg from "pg";
const { Pool } = pkg;

const sslRequired = String(process.env.PGSSLMODE || "").toLowerCase() === "require";

const db = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000,
});

export default db;
