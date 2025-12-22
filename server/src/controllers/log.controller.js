export const logClientError = async (req, res) => {
  try {
    const { timestamp, message, stack, context, level, deviceInfo } = req.body;

    // Format the log message for console
    const logPrefix = `[MOBILE ${level.toUpperCase()}]`;
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

    // You can also store these logs in a database or send to a logging service
    // For now, we're just logging to Render console

    res.status(200).json({ success: true, message: 'Log received' });
  } catch (error) {
    console.error('Error processing client log:', error);
    // Don't fail the request - logging errors shouldn't break the app
    res.status(200).json({ success: true, message: 'Log processed with errors' });
  }
};

export const getRecentLogs = async (req, res) => {
  try {
    // This is a placeholder - you could implement database storage later
    res.status(200).json({
      message: 'Logs are currently only visible in Render console. Check your Render dashboard logs.',
      info: 'To persist logs, consider adding a database model or using a service like Sentry/LogRocket'
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};
