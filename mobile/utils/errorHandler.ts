import * as Sentry from '@sentry/react-native';

// Global error handler - Sentry will automatically catch unhandled errors
// But we can still add custom handling if needed
export const setupGlobalErrorHandler = () => {
  // Sentry automatically handles global errors when initialized
  // No additional setup needed - Sentry.init() in _layout.tsx handles this
};

// Override console methods in production to send to Sentry
export const setupConsoleOverride = () => {
  if (!__DEV__) {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      // Send console.error to Sentry
      const message = args[0]?.toString() || 'Console Error';
      const error = args[1] instanceof Error ? args[1] : new Error(message);

      Sentry.captureException(error, {
        level: 'error',
        contexts: {
          console: {
            args: args.map(arg => String(arg)),
          }
        }
      });

      originalError(...args);
    };

    console.warn = (...args) => {
      // Send console.warn to Sentry
      Sentry.captureMessage(args[0]?.toString() || 'Console Warning', {
        level: 'warning',
        contexts: {
          console: {
            args: args.map(arg => String(arg)),
          }
        }
      });

      originalWarn(...args);
    };
  }
};
