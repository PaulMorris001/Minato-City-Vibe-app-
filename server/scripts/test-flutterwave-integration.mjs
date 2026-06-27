/**
 * Flutterwave integration smoke test (runs against a LIVE dev server).
 *
 * Unlike resolveProvider.test.mjs (pure logic), this exercises the real HTTP
 * endpoints + Flutterwave's test API, so it needs:
 *   - the server running with FLW_* test keys configured
 *   - a logged-in vendor token whose location.country routes to Flutterwave
 *
 * Usage:
 *   API_URL=http://localhost:5000/api \
 *   TOKEN=<jwt-of-a-nigerian-vendor> \
 *   GUIDE_ID=<a-paid-guide-id-owned-by-that-vendor> \
 *   node scripts/test-flutterwave-integration.mjs
 *
 * What it checks:
 *   1. GET  /flutterwave/banks?country=NG     → returns a non-empty bank list
 *   2. GET  /flutterwave/connect/status        → returns the onboarding shape
 *   3. GET  /payments/config                   → returns the FLW public key
 *   4. POST /payments/init/guide/:id           → returns provider:"flutterwave"
 *                                                 + a hosted paymentLink
 *
 * It does NOT complete a real payment (that needs the hosted checkout UI); open
 * the returned paymentLink in a browser with a Flutterwave test card to finish
 * the end-to-end flow, then confirm the guide unlocked.
 */

const API_URL = process.env.API_URL || "http://localhost:5000/api";
const TOKEN = process.env.TOKEN;
const GUIDE_ID = process.env.GUIDE_ID;

if (!TOKEN) {
  console.error("✗ Set TOKEN=<jwt of a Nigerian vendor>. See header for usage.");
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };
let passed = 0;
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

const json = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.message || JSON.stringify(body)}`);
  return body;
};

console.log(`Flutterwave integration smoke test → ${API_URL}\n`);

await step("GET /flutterwave/banks?country=NG returns banks", async () => {
  const data = await json(await fetch(`${API_URL}/flutterwave/banks?country=NG`, { headers: auth }));
  if (!Array.isArray(data.banks) || data.banks.length === 0) {
    throw new Error("expected a non-empty banks array");
  }
  if (!data.banks[0].code || !data.banks[0].name) {
    throw new Error("bank entries must have { code, name }");
  }
});

await step("GET /flutterwave/connect/status returns onboarding shape", async () => {
  const data = await json(await fetch(`${API_URL}/flutterwave/connect/status`, { headers: auth }));
  if (typeof data.onboardingComplete !== "boolean") {
    throw new Error("expected boolean onboardingComplete");
  }
});

await step("GET /payments/config exposes the Flutterwave public key", async () => {
  const data = await json(await fetch(`${API_URL}/payments/config`));
  if (!data.flutterwavePublicKey) throw new Error("flutterwavePublicKey is empty — check FLW_PUBLIC_KEY");
});

if (GUIDE_ID) {
  await step("POST /payments/init/guide/:id routes to Flutterwave with a link", async () => {
    const data = await json(
      await fetch(`${API_URL}/payments/init/guide/${GUIDE_ID}`, { method: "POST", headers: auth })
    );
    if (data.provider !== "flutterwave") {
      throw new Error(`expected provider "flutterwave", got "${data.provider}" — is the vendor's country routed to Flutterwave + onboarded?`);
    }
    if (!data.paymentLink) throw new Error("no paymentLink returned");
    console.log(`      → open to finish payment: ${data.paymentLink}`);
  });
} else {
  console.log("  • (skipped payments/init — set GUIDE_ID to test it)");
}

console.log(`\n${failed === 0 ? "✅" : "⚠️"}  ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
