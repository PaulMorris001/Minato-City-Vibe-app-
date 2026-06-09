import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

/**
 * One-time cleanup tied to the Firebase project migration
 * (nightvibe-89dee → cityvibe-819ff).
 *
 * Existing users have an `fcmToken` issued by the OLD Firebase project. The
 * server now uses the NEW project's Admin SDK to send pushes — and FCM tokens
 * are project-scoped, so the old tokens are unrecognized and every send to
 * them fails with `messaging/registration-token-not-registered`.
 *
 * Clearing the field forces the app to call `registerForPushNotifications`
 * on next launch and write a fresh token bound to the new project. Until a
 * user reopens the app, they get no pushes — that's the trade we made when
 * we switched Firebase projects.
 *
 * Safe to re-run (sets already-null fields to null, idempotent).
 *
 * Usage:
 *   cd server
 *   node migrate-clear-fcm-tokens.js
 *
 * Add --dry-run to preview the count without mutating.
 */
async function migrate() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    const User = mongoose.model('user', new mongoose.Schema({}, { strict: false }));

    const withToken = await User.countDocuments({
      fcmToken: { $nin: [null, undefined, ''] },
    });
    console.log(`Users currently holding an FCM token: ${withToken}`);

    if (dryRun) {
      console.log('Dry run — no changes made.');
    } else {
      const res = await User.updateMany(
        { fcmToken: { $nin: [null, undefined, ''] } },
        { $set: { fcmToken: null } }
      );
      console.log(`FCM tokens cleared on ${res.modifiedCount} users.`);
    }

    await mongoose.disconnect();
    console.log('\nDone. Disconnected from MongoDB');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

migrate();
