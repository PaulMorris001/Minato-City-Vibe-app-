import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import connectDB from './config/db.js';
import { initializeSocket } from './services/socket.service.js';
import { startEventReminderJob } from './jobs/eventReminder.job.js';
import { startPayoutReleaseJob } from './jobs/payoutRelease.job.js';
import { startExternalEventsRefresh } from './jobs/externalEventsRefresh.job.js';

import authRoutes from './routes/auth.route.js'
import vendorRoutes from "./routes/vendor.route.js";
import serviceRoutes from "./routes/service.route.js";
import eventRoutes from "./routes/event.route.js";
import chatRoutes from "./routes/chat.route.js";
import guideRoutes from "./routes/guide.route.js";
import uploadRoutes from "./routes/upload.route.js";
import logRoutes from "./routes/log.route.js";
import stripeRoutes from "./routes/stripe.route.js";
import notificationRoutes from "./routes/notification.route.js";
import favoritesRoutes from "./routes/favorites.route.js";
import adminRoutes from "./routes/admin.route.js";
import followRoutes from "./routes/follow.route.js";
import verificationRoutes from "./routes/verification.route.js";
import bookingRoutes from "./routes/booking.route.js";
import deleteAccountRoutes from "./routes/deleteAccount.route.js";
import deepLinksRoutes from "./routes/deepLinks.route.js";
import privacyRoutes from "./routes/privacy.route.js";
import csaeRoutes from "./routes/csae.route.js";
import reportRoutes from "./routes/report.route.js";
import blockRoutes from "./routes/block.route.js";
import locationRoutes from "./routes/location.route.js";
import externalEventRoutes from "./routes/externalEvent.route.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);

app.use(cors(config.cors));
app.options(/(.*)/, cors(config.cors));

// Stripe webhook needs raw body — must be registered BEFORE express.json()
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.server.env
  });
});

// Public marketing landing page. Served at the domain root so the site loads
// as a real page for humans (and partners like Ticketmaster) instead of 404ing
// the way a bare JSON API would. Static files live in server/public.
app.use(express.static(path.join(__dirname, '../public')));

app.use("/api/", adminRoutes);
app.use("/api/", authRoutes);
app.use("/api/", vendorRoutes);
app.use("/api/", serviceRoutes);
app.use("/api/", eventRoutes);
app.use("/api/", chatRoutes);
app.use("/api/", guideRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/", logRoutes);
app.use("/api/", stripeRoutes);
app.use("/api/", notificationRoutes);
app.use("/api/", favoritesRoutes);
app.use("/api/", followRoutes);
app.use("/api/", verificationRoutes);
app.use("/api/", bookingRoutes);
app.use("/api/", reportRoutes);
app.use("/api/", blockRoutes);
app.use("/api/", locationRoutes);
app.use("/api/", externalEventRoutes);
app.use("/", deleteAccountRoutes);
app.use("/", deepLinksRoutes);
app.use("/", privacyRoutes);
app.use("/", csaeRoutes);


// Initialize Socket.IO
const io = initializeSocket(httpServer);

// Start server
httpServer.listen(config.server.port, config.server.host, async () => {
  console.log(`🚀 Backend started at http://${config.server.host}:${config.server.port}`);
  console.log(`🌍 Environment: ${config.server.env}`);
  await connectDB();
  startEventReminderJob();
  startPayoutReleaseJob();
  startExternalEventsRefresh();
});