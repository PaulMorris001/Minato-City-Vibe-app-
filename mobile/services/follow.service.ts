import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

export interface FollowUser {
  _id: string;
  username: string;
  email?: string;
  profilePicture?: string;
  isVendor?: boolean;
  businessName?: string;
  isFollowing: boolean;
  isFollowedBy?: boolean;
  isMutual?: boolean;
}

export interface FollowListResponse {
  users: FollowUser[];
  total: number;
  page: number;
  pages: number;
}

class FollowService {
  private async getAuthHeader() {
    const token = await SecureStore.getItemAsync("token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }

  async followUser(
    userId: string
  ): Promise<{ isFollowing: boolean; isMutual: boolean }> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/follow/${userId}`, {
      method: "POST",
      headers,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || "Failed to follow user");
    }

    return response.json();
  }

  async unfollowUser(userId: string): Promise<{ isFollowing: boolean }> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/follow/${userId}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      throw new Error("Failed to unfollow user");
    }

    return response.json();
  }

  async getFollowers(
    userId: string,
    page: number = 1
  ): Promise<FollowListResponse> {
    const headers = await this.getAuthHeader();
    const response = await fetch(
      `${BASE_URL}/follow/${userId}/followers?page=${page}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch followers");
    }

    return response.json();
  }

  async getFollowing(
    userId: string,
    page: number = 1
  ): Promise<FollowListResponse> {
    const headers = await this.getAuthHeader();
    const response = await fetch(
      `${BASE_URL}/follow/${userId}/following?page=${page}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch following");
    }

    return response.json();
  }

  async getFollowCounts(
    userId: string
  ): Promise<{ followersCount: number; followingCount: number }> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/follow/${userId}/counts`, {
      headers,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch follow counts");
    }

    return response.json();
  }

  async getFollowStatus(
    userId: string
  ): Promise<{
    isFollowing: boolean;
    isFollowedBy: boolean;
    isMutual: boolean;
  }> {
    const headers = await this.getAuthHeader();
    const response = await fetch(`${BASE_URL}/follow/${userId}/status`, {
      headers,
    });

    if (!response.ok) {
      throw new Error("Failed to fetch follow status");
    }

    return response.json();
  }

  // People the current user follows who also follow `userId` — the count shown
  // on Discover People cards, listed out.
  async getMutualConnections(
    userId: string,
    page: number = 1
  ): Promise<FollowListResponse> {
    const headers = await this.getAuthHeader();
    const response = await fetch(
      `${BASE_URL}/follow/${userId}/mutual-connections?page=${page}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch mutual connections");
    }

    return response.json();
  }

  async getMutualFollows(
    query: string = "",
    page: number = 1
  ): Promise<FollowListResponse> {
    const headers = await this.getAuthHeader();
    const params = new URLSearchParams({ page: page.toString() });
    if (query.trim()) {
      params.set("query", query);
    }

    const response = await fetch(
      `${BASE_URL}/follow/mutual?${params.toString()}`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch mutual follows");
    }

    return response.json();
  }
}

const followService = new FollowService();
export default followService;
