/** @type {import('expo/config').ExpoConfig} */
// Google Sign-In (iOS): the native SDK needs the reversed-client-id URL scheme.
// Derive it from the iOS OAuth client id so only one value has to be set.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";
const GOOGLE_IOS_URL_SCHEME = GOOGLE_IOS_CLIENT_ID
  ? `com.googleusercontent.apps.${GOOGLE_IOS_CLIENT_ID.replace(
      /\.apps\.googleusercontent\.com$/,
      ""
    )}`
  : "com.googleusercontent.apps.placeholder";

module.exports = {
  name: "Cityvibe",
  slug: "nightvibe",
  version: "1.1.0",
  orientation: "portrait",
  icon: "./assets/images/ios/icon.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  // Native-only app (Stripe et al. don't bundle for web). Listing just the two
  // native platforms keeps `expo export` / `eas update --platform all` from
  // ever trying to build a web bundle.
  platforms: ["ios", "android"],
  // OTA updates via EAS Update. Bump `version` above whenever you do a fresh
  // native build (new module, permission, plugin change). All OTA updates are
  // pinned to a runtime that matches the binary's app version — old binaries
  // will not pick up an update built for a newer version.
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/a1e5c06d-26a5-4e05-89d9-3b9acf9a3ea4",
    // Wait up to 5s on launch for an update; otherwise the cached bundle
    // ships and the new one applies on the *next* open.
    fallbackToCacheTimeout: 5000,
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.nightvibe.minato",
    usesAppleSignIn: true,
    associatedDomains: ["applinks:night-vibe.onrender.com"],
    // In EAS Build, GOOGLE_SERVICES_PLIST is the path to the secret file.
    // Locally, fall back to the file in the project root.
    googleServicesFile: process.env.GOOGLE_SERVICES_PLIST || "./GoogleService-Info.plist",
    icon: {
      dark: "./assets/icons/ios-dark.png",
      light: "./assets/icons/ios-light.png",
      tinted: "./assets/icons/ios-tinted.png",
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.nightvibe.mobile",
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "night-vibe.onrender.com", pathPrefix: "/event" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: "night-vibe.onrender.com", pathPrefix: "/guide" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
      // Custom-scheme handler so the web preview's "Open in app" button
      // (mobile://event/<id>, mobile://guide/<id>, mobile://share/<token>)
      // can launch the app on Android. iOS is already covered by the
      // top-level `scheme: "mobile"`.
      {
        action: "VIEW",
        data: [{ scheme: "mobile" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    // In EAS Build, GOOGLE_SERVICES_JSON is the path to the secret file.
    // Locally, fall back to the file in the project root.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
    icon: "./assets/images/android-icon-foreground.png",
    adaptiveIcon: {
      foregroundImage: "./assets/icons/adaptive-icon.png",
      monochromeImage: "./assets/icons/adaptive-icon.png",
      background: "#ffffff",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "pan",
  },
  plugins: [
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    "./plugins/withFirebaseFix",
    "expo-apple-authentication",
    [
      "@react-native-google-signin/google-signin",
      {
        iosUrlScheme: GOOGLE_IOS_URL_SCHEME,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "CityVibe uses your location to show events and guides near you.",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "CityVibe uses the camera to scan event and guide QR codes.",
        recordAudioAndroid: false,
      },
    ],
    "expo-video",
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/icons/splash-icon-dark.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          image: "./assets/icons/splash-icon-light.png",
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "@sentry/react-native/expo",
      {
        url: "https://sentry.io/",
        project: "react-native",
        organization: "minato-tu",
        setCommits: false,
      },
    ],
    [
      "@stripe/stripe-react-native",
      {
        enableGooglePay: true,
      },
    ],
    [
      "expo-notifications",
      {
        color: "#a855f7",
      },
    ],
    [
      "expo-calendar",
      {
        calendarPermission: "CityVibe needs calendar access to add events you're attending so you get a reminder and a quick link back to the event.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "a1e5c06d-26a5-4e05-89d9-3b9acf9a3ea4",
    },
  },
  owner: "setemiloye1",
};
