import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "db", "schema.sql");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Add it to software/backend/.env");
}

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

try {
  const schema = await fs.readFile(schemaPath, "utf8");
  await client.connect();
  await client.query(schema);
  console.log("Database schema migrated successfully.");
} finally {
  await client.end();
}
