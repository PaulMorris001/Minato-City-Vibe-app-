#!/usr/bin/env node
/**
 * Generates the bcrypt hash for ADMIN_PASSWORD_HASH.
 *
 *   npm run hash-admin-password        (from the repo root)
 *
 * Prompts for the password (not echoed, and never in shell history), prints the
 * hash, and you paste that into the server's environment as ADMIN_PASSWORD_HASH
 * — then delete the plaintext ADMIN_PASSWORD var.
 *
 * See adminLogin in src/controllers/admin.controller.js for the consumer.
 */
import bcrypt from "bcrypt";
import readline from "readline";

const ROUNDS = 12;
const MIN_LENGTH = 16;

// One interface, consumed as an async iterator. Two sequential `rl.question`
// calls don't work here: with non-TTY stdin readline emits both lines while the
// first question is still settling, so the second prompt waits forever.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdin.isTTY === true,
});

let muted = false;
const write = rl._writeToOutput?.bind(rl);
if (write) {
  rl._writeToOutput = (str) => {
    if (!muted) write(str);
  };
}

const lines = rl[Symbol.asyncIterator]();

/** Prompts without echoing what's typed. Returns "" if stdin ends. */
async function promptHidden(question) {
  process.stdout.write(question);
  muted = true;
  const { value, done } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return done ? "" : String(value).trim();
}

function fail(message) {
  rl.close();
  console.error(`Aborted: ${message}`);
  process.exit(1);
}

const password = await promptHidden("New admin password: ");
const confirm = await promptHidden("Confirm password:    ");
rl.close();

if (!password) fail("password was empty.");
if (password !== confirm) fail("passwords did not match.");
if (password.length < MIN_LENGTH) {
  fail(
    `use at least ${MIN_LENGTH} characters. This is the single credential ` +
      "guarding every destructive admin endpoint — generate a random one."
  );
}

const hash = await bcrypt.hash(password, ROUNDS);

console.log("Set this in the server environment:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
console.log("Then REMOVE the plaintext ADMIN_PASSWORD variable.");
