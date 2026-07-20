import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CartItem } from "@/libs/interfaces";

const STORAGE_KEY = "cart_v1";

/**
 * Single-vendor cart. A cart belongs to exactly one vendor — adding an item
 * from a different vendor requires clearing the current cart first (the UI
 * prompts the user). Persisted to AsyncStorage so it survives app restarts.
 */
interface CartState {
  vendorId: string;
  vendorName: string;
  items: CartItem[];
}

interface CartContextType {
  vendorId: string | null;
  vendorName: string | null;
  items: CartItem[];
  count: number;
  subtotal: number;
  /** True when adding this vendor's item would replace a different vendor's cart. */
  isDifferentVendor: (vendorId: string) => boolean;
  addItem: (vendorId: string, vendorName: string, item: CartItem) => void;
  setQuantity: (serviceId: string, quantity: number) => void;
  setNote: (serviceId: string, note: string) => void;
  removeItem: (serviceId: string) => void;
  clear: () => void;
}

const emptyState: CartState = { vendorId: "", vendorName: "", items: [] };

const CartContext = createContext<CartContextType>({
  vendorId: null,
  vendorName: null,
  items: [],
  count: 0,
  subtotal: 0,
  isDifferentVendor: () => false,
  addItem: () => {},
  setQuantity: () => {},
  setNote: () => {},
  removeItem: () => {},
  clear: () => {},
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>(emptyState);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted cart once on mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setState(JSON.parse(raw));
      } catch {}
      setHydrated(true);
    })();
  }, []);

  // Persist on every change (after hydration so we don't clobber stored data).
  useEffect(() => {
    if (!hydrated) return;
    if (state.items.length === 0) {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    } else {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }
  }, [state, hydrated]);

  const isDifferentVendor = useCallback(
    (vendorId: string) =>
      state.items.length > 0 && !!state.vendorId && state.vendorId !== vendorId,
    [state.items.length, state.vendorId]
  );

  const addItem = useCallback(
    (vendorId: string, vendorName: string, item: CartItem) => {
      setState((prev) => {
        // Switching vendors starts a fresh cart.
        const base =
          prev.vendorId && prev.vendorId !== vendorId
            ? { vendorId, vendorName, items: [] as CartItem[] }
            : { vendorId, vendorName, items: [...prev.items] };

        const idx = base.items.findIndex((i) => i.serviceId === item.serviceId);
        if (idx >= 0) {
          base.items[idx] = {
            ...base.items[idx],
            quantity: base.items[idx].quantity + item.quantity,
          };
        } else {
          base.items.push(item);
        }
        return base;
      });
    },
    []
  );

  const setQuantity = useCallback((serviceId: string, quantity: number) => {
    setState((prev) => {
      if (quantity <= 0) {
        const items = prev.items.filter((i) => i.serviceId !== serviceId);
        return items.length ? { ...prev, items } : emptyState;
      }
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.serviceId === serviceId ? { ...i, quantity } : i
        ),
      };
    });
  }, []);

  const setNote = useCallback((serviceId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.serviceId === serviceId ? { ...i, note } : i
      ),
    }));
  }, []);

  const removeItem = useCallback((serviceId: string) => {
    setState((prev) => {
      const items = prev.items.filter((i) => i.serviceId !== serviceId);
      return items.length ? { ...prev, items } : emptyState;
    });
  }, []);

  const clear = useCallback(() => setState(emptyState), []);

  const count = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );
  const subtotal = useMemo(
    () => state.items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [state.items]
  );

  const value: CartContextType = {
    vendorId: state.vendorId || null,
    vendorName: state.vendorName || null,
    items: state.items,
    count,
    subtotal,
    isDifferentVendor,
    addItem,
    setQuantity,
    setNote,
    removeItem,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
