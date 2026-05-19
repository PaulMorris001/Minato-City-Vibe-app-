/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Nightvibe",
  slug: "nightvibe",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/ios/icon.png",
  scheme: "mobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
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
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    "./plugins/withFirebaseFix",
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
