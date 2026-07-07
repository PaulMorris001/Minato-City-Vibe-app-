import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import socketService from "@/services/socket.service";


export function capitalize(val: string | null) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export const useLogout = () => {
  const router = useRouter();

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync("token");
      await SecureStore.deleteItemAsync("user");
      socketService.disconnect();
      router.replace("/login");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return logout;
};
