import express from 'express';
import { logClientError, getRecentLogs } from '../controllers/log.controller.js';

const router = express.Router();

// POST endpoint to receive logs from mobile app
router.post('/logs', logClientError);

// GET endpoint to view recent logs (optional)
router.get('/logs', getRecentLogs);

export default router;
