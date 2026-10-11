import { execSync } from "node:child_process";

// Applies migrations to the test database once per run.
// TEST_DATABASE_PROVIDER=mysql runs the suite against MySQL (regenerate the client first: DATABASE_PROVIDER=mysql npx prisma generate).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL database to run integration tests.");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_PROVIDER: process.env.TEST_DATABASE_PROVIDER ?? "postgresql", DATABASE_URL: url, DATABASE_URL_UNPOOLED: "" },
  });
}
