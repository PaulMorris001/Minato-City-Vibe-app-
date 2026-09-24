import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

export interface TicketOffer {
  _id: string;
  event: string;
  chat: string;
  eventTitle: string;
  ticketName: string;
  quantity: number;
  currency: string;
  standardPrice: number;
  offeredPrice: number;
  finalPrice?: number;
  note?: string;
  locationName?: string;
  locationCity?: string;
  eventDate?: string;
  status: "requested" | "quoted" | "declined" | "cancelled";
  paid?: boolean;
  isOrganizer?: boolean;
}

export interface NegotiationOptions {
  _id: string;
  title: string;
  currency: string;
  location: string;
  city?: string;
  additionalLocations?: { location: string; city?: string }[];
  salesClosed: boolean;
  stops: {
    id: string | null;
    title: string;
    ticketPrice: number;
    salesClosed: boolean;
    soldOut: boolean;
    ticketTiers: { _id: string; name: string; price: number; soldOut?: boolean }[];
  }[];
}

export async function ticketOfferRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const token = await SecureStore.getItemAsync("token");
  if (!token) throw new Error("Log in to negotiate tickets.");
  try {
    const response = await axios({ url: `${BASE_URL}${path}`, method, data, headers: { Authorization: `Bearer ${token}` } });
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.message || "Couldn't connect. Please try again.");
  }
}
