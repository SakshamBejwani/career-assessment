// Creates an ADMIN_USERS entry.  Usage: npm run admin:hash-password -- admin@example.com
// The password is read from the terminal (not echoed) or from ADMIN_PASSWORD for automation.
import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) {
  console.error("Usage: npm run admin:hash-password -- you@example.com");
  process.exit(1);
}

async function readPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => {
    if (s.includes("Password")) rl.output.write(s);
  };
  const answer = await new Promise((resolve) => rl.question("Password (min 12 characters): ", resolve));
  rl.close();
  process.stdout.write("\n");
  return answer;
}

const password = await readPassword();
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
const salt = randomBytes(16);
const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
console.log(`\nAdd this to ADMIN_USERS (comma-separate multiple admins):\n\n${email}:scrypt.16384.8.1.${salt.toString("base64url")}.${hash.toString("base64url")}\n`);
