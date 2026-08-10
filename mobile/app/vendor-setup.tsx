import React from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

import BecomeVendorModal from "@/components/client/BecomeVendorModal";

/**
 * Business-details step for people who signed up AS a vendor.
 *
 * Signup can't create the vendor account outright: `/become-vendor` needs a
 * business name, type and city, and none of that belongs in a 4-step auth
 * wizard. So registration records the intent (`vendorSignupPending`) and this
 * screen — reached straight after email verification, and again on any later
 * login while the flag is still set — collects the rest and calls the same
 * endpoint the "Become a Vendor" upgrade path uses.
 *
 * On success the form itself switches the active account and resets into the
 * vendor dashboard, so a new vendor never passes through the client tabs.
 */
export default function VendorSetup() {
  const router = useRouter();

  const skip = () => {
    Alert.alert(
      "Skip for now?",
      "You'll browse OurCityvibe as a regular account until you add your business details. You can finish setup anytime from the Vendors tab.",
      [
        { text: "Keep setting up", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: async () => {
            // Clear the local intent so the client app doesn't bounce them
            // back here on every launch. The server flag stays set — it's what
            // lets them resume later — but this device stops auto-routing.
            try {
              const raw = await SecureStore.getItemAsync("user");
              if (raw) {
                const u = JSON.parse(raw);
                u.vendorSignupPending = false;
                await SecureStore.setItemAsync("user", JSON.stringify(u));
              }
            } catch {
              // Non-fatal: worst case they land here once more.
            }
            router.replace("/(tabs)/home");
          },
        },
      ]
    );
  };

  return (
    <BecomeVendorModal
      visible
      presentation="screen"
      onClose={() => router.replace("/(tabs)/home")}
      onSkip={skip}
    />
  );
}
