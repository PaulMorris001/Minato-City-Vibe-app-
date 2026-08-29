import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import socketService from "@/services/socket.service";
import { clearLocalData } from "@/utils/localData";
import { unregisterForPushNotifications } from "@/utils/pushNotifications";
import { useAccount } from "@/contexts/AccountContext";
import { useCart } from "@/contexts/CartContext";
import { useUnread } from "@/contexts/UnreadContext";


export function capitalize(val: string | null) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export const useLogout = () => {
  const router = useRouter();
  const { setActiveAccount } = useAccount();
  const cart = useCart();
  const { reset: resetUnread } = useUnread();

  const logout = async () => {
    try {
      await unregisterForPushNotifications();
      await SecureStore.deleteItemAsync("token");
      await SecureStore.deleteItemAsync("user");
      await setActiveAccount("client");
      cart.clear();
      resetUnread();
      await clearLocalData();
      socketService.disconnect();
      router.replace("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return logout;
};
