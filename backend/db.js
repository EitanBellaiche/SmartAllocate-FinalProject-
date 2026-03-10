import pkg from "pg";
import { env } from "./config/env.js";
const { Pool } = pkg;

const sslRequired = String(env.pgSslMode || "").toLowerCase() === "require";

const db = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    })
  : new Pool({
      host: env.pgHost,
      port: env.pgPort,
      database: env.pgDatabase,
      user: env.pgUser,
      password: env.pgPassword,
      ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 10000,
    });

export default db;
