import AnalyticsLog from "../models/analytics.model.js";

export const logClientError = async (req, res) => {
  try {
    const { timestamp, message, stack, context, level, deviceInfo } = req.body;

    // Format the log message for console
    const logPrefix = `[MOBILE ${level?.toUpperCase() ?? "INFO"}]`;
    const timeStr = new Date(timestamp).toLocaleString();

    console.log('\n' + '='.repeat(80));
    console.log(`${logPrefix} ${timeStr}`);
    console.log(`Message: ${message}`);

    if (stack) {
      console.log(`Stack: ${stack}`);
    }

    if (context) {
      console.log(`Context:`, JSON.stringify(context, null, 2));
    }

    if (deviceInfo) {
      console.log(`Device: ${deviceInfo.platform} ${deviceInfo.osVersion} - App v${deviceInfo.appVersion}`);
    }

    console.log('='.repeat(80) + '\n');

    // Persist analytics events to MongoDB
    if (level === "info" && message) {
      AnalyticsLog.create({
        userId: req.user?.id ?? null,
        event: message,
        properties: context ?? {},
        platform: deviceInfo?.platform,
        osVersion: deviceInfo?.osVersion,
        appVersion: deviceInfo?.appVersion,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      }).catch(() => {}); // fire-and-forget, never fail the request
    }

    res.status(200).json({ success: true, message: 'Log received' });
  } catch (error) {
    console.error('Error processing client log:', error);
    res.status(200).json({ success: true, message: 'Log processed with errors' });
  }
};

export const getRecentLogs = async (req, res) => {
  try {
    const logs = await AnalyticsLog.find()
      .sort({ timestamp: -1 })
      .limit(50)
      .populate("userId", "username email");
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};
