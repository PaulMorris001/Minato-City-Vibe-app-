import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import config from './config/env.js';
import connectDB from './config/db.js';
import { initializeSocket } from './services/socket.service.js';

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


const app = express();
const httpServer = createServer(app);

app.use(cors(config.cors));
app.options('*', cors(config.cors));

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


// Initialize Socket.IO
const io = initializeSocket(httpServer);

// Start server
httpServer.listen(config.server.port, config.server.host, async () => {
  console.log(`🚀 Backend started at http://${config.server.host}:${config.server.port}`);
  console.log(`🌍 Environment: ${config.server.env}`);
  await connectDB();
});