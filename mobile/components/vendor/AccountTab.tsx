import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { unregisterForPushNotifications } from "@/utils/pushNotifications";
import axios from "axios";
import { useRouter } from "expo-router";
import socketService from "@/services/socket.service";
import { BASE_URL } from "@/constants/constants";
import { payoutProviderForCountry } from "@/constants/payments";
import { fetchVendorTypes } from "@/libs/api";
import { VendorType, LocationSelection } from "@/libs/interfaces";
import { LocationPicker, ImagePickerButton } from "@/components/shared";
import { formatLocation } from "@/utils/location";
import { uploadImage } from "@/utils/imageUpload";
import { VN, VNF } from "./vendorTheme";

interface AccountTabProps {
  onRefresh: () => void;
}

const SOCIAL_META: { key: "instagram" | "tiktok" | "twitter" | "facebook"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "instagram", label: "Instagram", icon: "logo-instagram" },
  { key: "tiktok", label: "TikTok", icon: "logo-tiktok" },
  { key: "twitter", label: "X (Twitter)", icon: "logo-twitter" },
  { key: "facebook", label: "Facebook", icon: "logo-facebook" },
];

export default function AccountTab({ onRefresh }: AccountTabProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [stripeOnboardingComplete, setStripeOnboardingComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>([]);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [businessPicture, setBusinessPicture] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [rating, setRating] = useState(0);
  const [ratingCount, setRatingCount] = useState(0);
  const [profile, setProfile] = useState({
    username: "",
    email: "",
    businessName: "",
    businessDescription: "",
    vendorType: "",
    vendorTypeName: "",
    cityName: "",
    state: "",
    country: "",
    address: "",
    phone: "",
    website: "",
    instagram: "",
    twitter: "",
    tiktok: "",
    facebook: "",
    verified: false,
  });

  useEffect(() => {
    fetchProfile();
    loadVendorTypes();
    fetchStats();
  }, []);

  // Check the right provider's payout status for this vendor's country (Stripe
  // for US, Flutterwave for African vendors). Called once the country is known.
  const fetchPayoutStatus = async (country: string) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const provider = payoutProviderForCountry(country);
      const path =
        provider === "flutterwave"
          ? "/flutterwave/connect/status"
          : provider === "wise"
          ? "/wise/connect/status"
          : "/stripe/connect/status";
      const res = await axios.get(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStripeOnboardingComplete(res.data.onboardingComplete ?? false);
    } catch {
      // Non-critical — silently ignore
    }
  };

  const fetchStats = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/vendor/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRating(res.data?.rating ?? 0);
      setRatingCount(res.data?.ratingCount ?? 0);
    } catch {
      // Non-critical
    }
  };

  const loadVendorTypes = async () => {
    try {
      const t = await fetchVendorTypes();
      if (Array.isArray(t) && t.length > 0) setVendorTypes(t);
    } catch {
      // silently ignore — picker just stays empty if fetch fails
    }
  };

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = res.data.user;
      setProfile({
        username: user.username || "",
        email: user.email || "",
        businessName: user.businessName || "",
        businessDescription: user.businessDescription || "",
        vendorType: user.vendorType || "",
        vendorTypeName: user.vendorTypeName || user.vendorType || "",
        cityName: user.location?.city || "",
        state: user.location?.state || "",
        country: user.location?.country || "",
        address: user.location?.address || "",
        phone: user.contactInfo?.phone || "",
        website: user.contactInfo?.website || "",
        instagram: user.contactInfo?.instagram || "",
        twitter: user.contactInfo?.twitter || "",
        tiktok: user.contactInfo?.tiktok || "",
        facebook: user.contactInfo?.facebook || "",
        verified: user.verified || false,
      });
      setBusinessPicture(user.businessPicture || "");
      setProfilePicture(user.profilePicture || "");
      fetchPayoutStatus(user.location?.country || "");
    } catch (error: any) {
      console.error("Error fetching profile:", error);
      Alert.alert("Error", "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      let businessPictureUrl = businessPicture;
      let profilePictureUrl = profilePicture;

      if (businessPicture && businessPicture.startsWith("file://")) {
        try {
          const result = await uploadImage(businessPicture, "businesses", token!);
          businessPictureUrl = result.url;
          setBusinessPicture(businessPictureUrl);
        } catch {
          Alert.alert("Upload Error", "Failed to upload business picture");
          setSaving(false);
          return;
        }
      }

      if (profilePicture && profilePicture.startsWith("file://")) {
        try {
          const result = await uploadImage(profilePicture, "profiles", token!);
          profilePictureUrl = result.url;
          setProfilePicture(profilePictureUrl);
        } catch {
          Alert.alert("Upload Error", "Failed to upload profile picture");
          setSaving(false);
          return;
        }
      }

      await axios.put(
        `${BASE_URL}/vendor/profile`,
        {
          businessName: profile.businessName,
          businessDescription: profile.businessDescription,
          businessPicture: businessPictureUrl,
          profilePicture: profilePictureUrl,
          vendorType: profile.vendorTypeName,
          location: {
            city: profile.cityName,
            state: profile.state,
            country: profile.country,
            address: profile.address,
          },
          contactInfo: {
            phone: profile.phone,
            website: profile.website,
            instagram: profile.instagram,
            twitter: profile.twitter,
            tiktok: profile.tiktok,
            facebook: profile.facebook,
          },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert("Success", "Profile updated successfully");
      setIsEditing(false);
      onRefresh();
    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const selectVendorType = (type: VendorType) => {
    setProfile({ ...profile, vendorType: type._id, vendorTypeName: type.name });
    setShowTypePicker(false);
  };

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            await unregisterForPushNotifications();
            await SecureStore.deleteItemAsync("user");
            await SecureStore.deleteItemAsync("token");
            await SecureStore.deleteItemAsync("activeAccount");
          } catch {}
          socketService.disconnect();
          router.replace("/login");
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={VN.purple} />
      </View>
    );
  }

  const onLocationChange = (sel: LocationSelection) =>
    setProfile((p) => ({ ...p, cityName: sel.city, state: sel.state, country: sel.country }));

  // ── Read-mode field row ───────────────────────────────────────
  const Field = ({ label, value, link, multi }: { label: string; value?: string; link?: boolean; multi?: boolean }) => (
    <TouchableOpacity style={styles.fieldRow} activeOpacity={0.7} onPress={() => setIsEditing(true)}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text
          style={[styles.fieldValue, link && { color: VN.purpleSoft, fontFamily: VNF.semibold }]}
          numberOfLines={multi ? undefined : 1}
        >
          {value || "—"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={VN.textMute} />
    </TouchableOpacity>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionKicker}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );

  const StatusPill = ({ tone, icon, label, onPress }: { tone: "green" | "amber" | "purple"; icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }) => {
    const pal = {
      green: { bg: "rgba(52,211,153,0.16)", br: "rgba(52,211,153,0.35)", tx: VN.greenSoft },
      amber: { bg: "rgba(245,158,11,0.16)", br: "rgba(245,158,11,0.35)", tx: VN.amberSoft },
      purple: { bg: "rgba(168,85,247,0.16)", br: "rgba(192,132,252,0.35)", tx: VN.purpleSoft },
    }[tone];
    return (
      <TouchableOpacity
        disabled={!onPress}
        onPress={onPress}
        activeOpacity={0.8}
        style={[styles.statusPill, { backgroundColor: pal.bg, borderColor: pal.br }]}
      >
        <Ionicons name={icon} size={11} color={pal.tx} />
        <Text style={[styles.statusPillText, { color: pal.tx }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Business-card hero */}
      <View style={styles.heroWrap}>
        <View style={styles.heroCard}>
          {/* Cover */}
          <View style={styles.cover}>
            {businessPicture ? (
              <Image source={{ uri: businessPicture }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
            ) : (
              <LinearGradient colors={["#F59E0B", "#EC4899", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill as any} />
            )}
            <LinearGradient colors={["transparent", "rgba(0,0,0,0.45)"]} locations={[0.5, 1]} style={StyleSheet.absoluteFill as any} />
            <TouchableOpacity style={styles.editCoverBtn} onPress={() => setIsEditing(true)} activeOpacity={0.8}>
              <Ionicons name="pencil" size={13} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <View style={styles.heroBody}>
            <View style={styles.avatar}>
              {profilePicture ? (
                <Image source={{ uri: profilePicture }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <LinearGradient colors={["#22D3EE", "#7C3AED", "#EC4899"]} style={styles.avatarImg}>
                  <Ionicons name="storefront" size={28} color="#fff" />
                </LinearGradient>
              )}
            </View>

            <View style={styles.nameRow}>
              <Text style={styles.bizName}>{profile.businessName || "Your business"}</Text>
              {profile.verified && (
                <LinearGradient colors={["#A855F7", "#EC4899"]} style={styles.verifiedBadge}>
                  <Text style={styles.verifiedGlyph}>✦</Text>
                </LinearGradient>
              )}
            </View>
            <Text style={styles.bizSub}>
              {profile.vendorTypeName || "Vendor"} · @{(profile.username || "").toLowerCase()}
            </Text>

            <View style={styles.pillsRow}>
              <StatusPill
                tone={profile.verified ? "green" : "amber"}
                icon={profile.verified ? "checkmark" : "time-outline"}
                label={profile.verified ? "Verified" : "Verification pending"}
              />
              <StatusPill
                tone={stripeOnboardingComplete ? "green" : "amber"}
                icon="cash-outline"
                label={stripeOnboardingComplete ? "Payouts active" : "Set up payouts →"}
                onPress={stripeOnboardingComplete ? undefined : () => router.push("/settings")}
              />
              <StatusPill tone="purple" icon="star" label={`${rating.toFixed(1)} · ${ratingCount}`} />
            </View>
          </View>
        </View>
      </View>

      {isEditing ? (
        /* ── EDIT MODE ── */
        <View style={styles.editWrap}>
          <View style={styles.imagePickers}>
            <ImagePickerButton imageUri={profilePicture} onImageSelected={setProfilePicture} label="Avatar" size={88} shape="circle" />
            <ImagePickerButton imageUri={businessPicture} onImageSelected={setBusinessPicture} label="Cover" size={88} shape="square" />
          </View>

          <Text style={styles.inputLabel}>Business name</Text>
          <TextInput style={styles.input} value={profile.businessName} onChangeText={(t) => setProfile({ ...profile, businessName: t })} placeholder="Business name" placeholderTextColor={VN.textMute} />

          <Text style={styles.inputLabel}>Vendor type</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowTypePicker(true)}>
            <Text style={{ color: profile.vendorTypeName ? VN.text : VN.textMute, fontFamily: VNF.body, fontSize: 15 }}>
              {profile.vendorTypeName || "Select vendor type"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.inputLabel}>Description</Text>
          <TextInput style={[styles.input, styles.multiline]} value={profile.businessDescription} onChangeText={(t) => setProfile({ ...profile, businessDescription: t })} placeholder="Describe your business..." placeholderTextColor={VN.textMute} multiline />

          <Text style={styles.inputLabel}>Location</Text>
          <LocationPicker
            value={{ country: profile.country, state: profile.state, city: profile.cityName }}
            onChange={onLocationChange}
            label=""
          />

          <Text style={styles.inputLabel}>Address</Text>
          <TextInput style={styles.input} value={profile.address} onChangeText={(t) => setProfile({ ...profile, address: t })} placeholder="Address" placeholderTextColor={VN.textMute} />

          <Text style={styles.inputLabel}>Phone</Text>
          <TextInput style={styles.input} value={profile.phone} onChangeText={(t) => setProfile({ ...profile, phone: t })} placeholder="Phone" placeholderTextColor={VN.textMute} keyboardType="phone-pad" />

          <Text style={styles.inputLabel}>Website</Text>
          <TextInput style={styles.input} value={profile.website} onChangeText={(t) => setProfile({ ...profile, website: t })} placeholder="Website" placeholderTextColor={VN.textMute} autoCapitalize="none" />

          {SOCIAL_META.map((s) => (
            <View key={s.key}>
              <Text style={styles.inputLabel}>{s.label}</Text>
              <TextInput
                style={styles.input}
                value={(profile as any)[s.key]}
                onChangeText={(t) => setProfile({ ...profile, [s.key]: t })}
                placeholder="@username or link"
                placeholderTextColor={VN.textMute}
                autoCapitalize="none"
              />
            </View>
          ))}

          <View style={styles.editActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setIsEditing(false); fetchProfile(); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} style={{ flex: 1 }} onPress={handleSave} disabled={saving}>
              <LinearGradient colors={["#A855F7", "#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtn}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* ── READ MODE ── */
        <>
          <Section title="Business">
            <Field label="Business name" value={profile.businessName} />
            <Field label="Vendor type" value={profile.vendorTypeName} />
            <Field label="Description" value={profile.businessDescription} multi />
          </Section>

          <Section title="Account">
            <Field label="Username" value={profile.username} />
            <Field label="Email" value={profile.email} />
          </Section>

          <Section title="Location">
            <Field label="City" value={formatLocation({ city: profile.cityName, state: profile.state, country: profile.country })} />
            <Field label="Address" value={profile.address} />
          </Section>

          <Section title="Contact">
            <Field label="Phone" value={profile.phone} />
            <Field label="Website" value={profile.website} link />
          </Section>

          <View style={styles.sectionWrap}>
            <Text style={styles.sectionKicker}>Socials</Text>
            <View style={styles.group}>
              {SOCIAL_META.map((s) => {
                const value = (profile as any)[s.key] as string;
                const empty = !value;
                return (
                  <TouchableOpacity key={s.key} style={styles.socialRow} activeOpacity={0.7} onPress={() => setIsEditing(true)}>
                    <View style={[styles.socialIcon, empty ? styles.socialIconEmpty : styles.socialIconSet]}>
                      <Ionicons name={s.icon} size={14} color={empty ? VN.textMute : VN.purpleSoft} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.fieldLabel}>{s.label}</Text>
                      <Text style={[styles.fieldValue, empty && { color: VN.textMute, fontStyle: "italic", fontFamily: VNF.body }]} numberOfLines={1}>
                        {empty ? "Not set · tap to add" : value}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={VN.textMute} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Log out */}
          <View style={styles.logoutWrap}>
            <TouchableOpacity style={styles.logoutRow} activeOpacity={0.8} onPress={handleLogout}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="log-out-outline" size={16} color={VN.textDim} />
                <Text style={styles.logoutText}>Log out</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={VN.textMute} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Vendor type picker */}
      <Modal visible={showTypePicker} transparent animationType="slide" onRequestClose={() => setShowTypePicker(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTypePicker(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select vendor type</Text>
              <TouchableOpacity onPress={() => setShowTypePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={vendorTypes}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.typeRow} onPress={() => selectVendorType(item)}>
                  <Ionicons name={(item.icon as any) || "briefcase"} size={20} color={profile.vendorType === item._id ? VN.purple : VN.textDim} />
                  <Text style={[styles.typeRowText, profile.vendorType === item._id && { color: VN.purpleSoft }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: VN.bg },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: VN.bg },

  heroWrap: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 },
  heroCard: { borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: VN.strokeHi, shadowColor: VN.purpleDeep, shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.45, shadowRadius: 28, elevation: 8 },
  cover: { height: 96, position: "relative" },
  editCoverBtn: { position: "absolute", right: 12, top: 12, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.4)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  heroBody: { backgroundColor: VN.surfaceHi, paddingHorizontal: 16, paddingBottom: 16 },
  avatar: { width: 76, height: 76, borderRadius: 38, marginTop: -38, marginBottom: 8, borderWidth: 3, borderColor: VN.bg, overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  bizName: { fontFamily: VNF.display, fontSize: 26, color: VN.text, letterSpacing: -0.8 },
  verifiedBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  verifiedGlyph: { color: "#fff", fontSize: 11 },
  bizSub: { fontFamily: VNF.medium, fontSize: 12.5, color: VN.textDim, marginTop: 4 },
  pillsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  statusPillText: { fontFamily: VNF.bold, fontSize: 11 },

  sectionWrap: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  sectionKicker: { fontFamily: VNF.bold, fontSize: 10, color: VN.textMute, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10, paddingLeft: 2 },
  group: { borderRadius: 16, overflow: "hidden", backgroundColor: VN.surface, borderWidth: 1, borderColor: VN.stroke },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: VN.stroke },
  fieldLabel: { fontFamily: VNF.medium, fontSize: 11, color: VN.textMute },
  fieldValue: { fontFamily: VNF.medium, fontSize: 14, color: VN.text, marginTop: 2, lineHeight: 20 },

  socialRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: VN.stroke },
  socialIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  socialIconSet: { backgroundColor: "rgba(168,85,247,0.16)", borderColor: "rgba(192,132,252,0.3)" },
  socialIconEmpty: { backgroundColor: "rgba(255,255,255,0.04)", borderColor: VN.stroke },

  logoutWrap: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },
  logoutRow: { height: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: VN.strokeHi, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoutText: { fontFamily: VNF.bold, fontSize: 13.5, color: VN.text },

  // Edit mode
  editWrap: { paddingHorizontal: 18, paddingTop: 4 },
  imagePickers: { flexDirection: "row", justifyContent: "space-around", marginBottom: 8 },
  inputLabel: { fontFamily: VNF.semibold, fontSize: 12, color: VN.textDim, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: VN.surface, borderWidth: 1, borderColor: VN.stroke, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontFamily: VNF.body, fontSize: 15, color: VN.text },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  editActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: { height: 48, paddingHorizontal: 18, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: VN.strokeHi },
  cancelBtnText: { fontFamily: VNF.bold, fontSize: 14, color: VN.textDim },
  saveBtn: { height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  saveBtnText: { fontFamily: VNF.heading, fontSize: 14, color: "#fff" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#1f1f2e", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%", paddingBottom: 30 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: VN.stroke },
  modalTitle: { fontFamily: VNF.heading, fontSize: 20, color: "#fff" },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderBottomWidth: 1, borderBottomColor: VN.stroke },
  typeRowText: { fontFamily: VNF.body, fontSize: 16, color: VN.text },
});
