import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: `.env.${process.env.NODE_ENV || "development"}` });
dotenv.config({ path: ".env.local", override: true });

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  pgHost: process.env.PGHOST || "",
  pgPort: process.env.PGPORT || "",
  pgDatabase: process.env.PGDATABASE || "",
  pgUser: process.env.PGUSER || "",
  pgPassword: process.env.PGPASSWORD || "",
  pgSslMode: process.env.PGSSLMODE || "",
  frontendUrl: process.env.FRONTEND_URL || "",
  corsOrigins: splitCsv(process.env.CORS_ORIGINS),
};

export function getAllowedOrigins() {
  const defaults = [
    "http://localhost:5174",
    "http://localhost:4173",
  ];

  return Array.from(
    new Set([
      ...defaults,
      ...splitCsv(env.frontendUrl),
      ...env.corsOrigins,
    ])
  );
}
