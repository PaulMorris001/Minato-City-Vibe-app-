/**
 * Smoke-test the sender identities against whatever SMTP the current
 * environment points at. Run after any change to SMTP credentials, mail DNS, or
 * the sender constants in src/services/email.service.js.
 *
 *   node scripts/verify-email-senders.mjs you@gmail.com
 *
 * It calls the real send functions instead of crafting its own message, so the
 * From / Reply-To / List-Unsubscribe headers it exercises are exactly the ones
 * production uses:
 *
 *   sendPasswordResetOTP    -> no-reply@  (+ Reply-To support@)
 *   sendEventReminderEmail  -> hello@     (+ List-Unsubscribe)
 *   sendEventPassEmail      -> no-reply@  (+ PDF ticket and QR image attached)
 *
 * support@ is inbound-only by design and never sends, so it cannot be tested
 * from here. Mail something TO it and confirm the inbox receives it.
 *
 * A zero exit code only proves SMTP accepted the message. Open the delivered
 * mail in Gmail ("Show original") and confirm SPF, DKIM and DMARC all read PASS
 * and that the From is the address you expect — a relay that rewrites From to
 * its authenticated mailbox still reports success here.
 */

import {
  sendPasswordResetOTP,
  sendEventReminderEmail,
  sendEventPassEmail,
} from "../src/services/email.service.js";
import { passQrBuffer } from "../src/utils/qrcode.js";

const to = process.argv[2];
if (!to || !to.includes("@")) {
  console.error("Usage: node scripts/verify-email-senders.mjs <recipient-email>");
  process.exit(1);
}

console.log(`\nSMTP target: ${process.env.SMTP_HOST || "(EMAIL_SERVICE branch)"}:${
  process.env.SMTP_PORT || "-"
} as ${process.env.EMAIL_USER || process.env.SMTP_USER || "(unset)"}\n`);

const checks = [
  {
    identity: "no-reply@ourcityvibe.com",
    expect: "Reply-To: support@ourcityvibe.com",
    run: () => sendPasswordResetOTP(to, "000000", "Sender check"),
  },
  {
    identity: "hello@ourcityvibe.com",
    expect: "List-Unsubscribe header, no Reply-To override",
    run: () =>
      sendEventReminderEmail(to, {
        username: "Sender check",
        eventTitle: "Sender identity verification",
        eventDateText: "Ignore this message",
        eventLocation: "",
        eventUrl: "",
        unsubscribeUrl: "https://api.ourcityvibe.com/unsubscribe/verify-test",
      }),
  },
  {
    identity: "no-reply@ourcityvibe.com (event pass)",
    expect: "a .pdf ticket and a .png QR in the attachment bar",
    run: async () =>
      sendEventPassEmail(to, {
        username: "Sender check",
        eventTitle: "Sender identity verification",
        eventDateText: "Ignore this message",
        eventLocation: "Nowhere",
        qrBuffer: await passQrBuffer("CV-TEST-0000-0000"),
        code: "CV-TEST-0000-0000",
        type: "ticket",
      }),
  },
];

let failed = 0;
for (const { identity, expect, run } of checks) {
  try {
    const res = await run();
    // The reminder swallows its own errors and reports success:false rather
    // than throwing, so a truthy result is not on its own proof of a send.
    if (res?.success === false) throw new Error("send reported success:false");
    console.log(`PASS  ${identity}\n      expect in headers: ${expect}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${identity}\n      ${err?.message ?? err}`);
  }
}

console.log(
  `\n${checks.length - failed}/${checks.length} senders accepted by SMTP.` +
    `\nsupport@ourcityvibe.com is receive-only — send it a mail and check the inbox.\n`
);
process.exit(failed ? 1 : 0);
