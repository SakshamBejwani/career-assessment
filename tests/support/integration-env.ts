import { setTestEnv } from "./env";

setTestEnv({
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_PROVIDER: process.env.TEST_DATABASE_PROVIDER ?? "postgresql",
  OWNER_NOTIFY_EMAILS: "owner@example.test",
});
