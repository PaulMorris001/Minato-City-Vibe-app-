import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Image,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { Service } from "@/libs/interfaces";
import { BASE_URL } from "@/constants/constants";
import ServiceModal from "./ServiceModal";
import { useFormatPrice } from "@/hooks/useFormatPrice";

interface ServicesTabProps {
  services: Service[];
  onRefresh: () => void;
  refreshing: boolean;
}

export default function ServicesTab({
  services,
  onRefresh,
  refreshing,
}: ServicesTabProps) {
  const formatPrice = useFormatPrice();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  const handleAddService = () => {
    setSelectedService(null);
    setModalVisible(true);
  };

  const handleEditService = (service: Service) => {
    setSelectedService(service);
    setModalVisible(true);
  };

  const handleDeleteService = (serviceId: string) => {
    Alert.alert(
      "Delete Service",
      "Are you sure you want to delete this service?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("token");
              await axios.delete(`${BASE_URL}/vendor/services/${serviceId}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              Alert.alert("Success", "Service deleted successfully");
              onRefresh();
            } catch (error: any) {
              Alert.alert(
                "Error",
                error.response?.data?.message || "Failed to delete service"
              );
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (service: Service) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      await axios.put(
        `${BASE_URL}/vendor/services/${service._id}`,
        { isActive: !service.isActive },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      onRefresh();
    } catch (error: any) {
      Alert.alert(
        "Error",
        error.response?.data?.message || "Failed to update service"
      );
    }
  };

  const renderServiceItem = ({ item }: { item: Service }) => (
    <View style={styles.serviceCard}>
      {/* Images */}
      {item.images && item.images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.imagesScroll}
          contentContainerStyle={styles.imagesContent}
        >
          {item.images.map((image, index) => (
            <Image
              key={index}
              source={{ uri: image }}
              style={styles.serviceImage}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.serviceHeader}>
        <View style={styles.serviceHeaderLeft}>
          <Text style={styles.serviceName}>{item.name}</Text>
          <View
            style={[
              styles.statusBadge,
              item.isActive ? styles.activeBadge : styles.inactiveBadge,
            ]}
          >
            <Text style={styles.statusText}>
              {item.isActive ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.serviceDescription} numberOfLines={2}>
        {item.description}
      </Text>

      <View style={styles.serviceInfo}>
        <View style={styles.infoItem}>
          <Ionicons name="pricetag" size={16} color="#9ca3af" />
          <Text style={styles.infoText}>{item.category}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="cash" size={16} color="#9ca3af" />
          <Text style={styles.infoText}>
            ${formatPrice(item.price)} {item.currency}
          </Text>
        </View>
      </View>

      {item.duration && (
        <View style={styles.durationContainer}>
          <Ionicons name="time-outline" size={16} color="#9ca3af" />
          <Text style={styles.durationText}>
            {item.duration.value} {item.duration.unit}
          </Text>
        </View>
      )}

      <View
        style={[
          styles.availabilityContainer,
          item.availability === "available" && styles.availableContainer,
          item.availability === "unavailable" && styles.unavailableContainer,
        ]}
      >
        <Text style={styles.availabilityText}>{item.availability}</Text>
      </View>

      <View style={styles.serviceActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.toggleButton]}
          onPress={() => handleToggleActive(item)}
        >
          <Ionicons
            name={item.isActive ? "eye-off" : "eye"}
            size={20}
            color="#3b82f6"
          />
          <Text style={styles.toggleButtonText}>
            {item.isActive ? "Deactivate" : "Activate"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={() => handleEditService(item)}
        >
          <Ionicons name="create-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteService(item._id)}
        >
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Services</Text>
          <Text style={styles.headerSubtitle}>
            {services.length} service{services.length !== 1 ? "s" : ""} total
          </Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAddService}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={services}
        renderItem={renderServiceItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={64} color="#4b5563" />
            <Text style={styles.emptyTitle}>No Services Yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to create your first service
            </Text>
          </View>
        }
      />

      <ServiceModal
        visible={modalVisible}
        service={selectedService}
        onClose={() => {
          setModalVisible(false);
          setSelectedService(null);
        }}
        onSuccess={() => {
          setModalVisible(false);
          setSelectedService(null);
          onRefresh();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#1f1f2e",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 2,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  serviceCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  imagesScroll: {
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 12,
  },
  imagesContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  serviceImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: "#374151",
  },
  serviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  serviceHeaderLeft: {
    flex: 1,
  },
  serviceName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  activeBadge: {
    backgroundColor: "#22c55e",
  },
  inactiveBadge: {
    backgroundColor: "#6b7280",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  serviceDescription: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 12,
    lineHeight: 20,
  },
  serviceInfo: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 8,
  },
  infoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: "#e5e7eb",
  },
  durationContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  durationText: {
    fontSize: 14,
    color: "#e5e7eb",
  },
  availabilityContainer: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  availableContainer: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  unavailableContainer: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  availabilityText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#e5e7eb",
    textTransform: "capitalize",
  },
  serviceActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
    paddingTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  toggleButton: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3b82f6",
  },
  editButton: {
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    borderWidth: 1,
    borderColor: Colors.primary,
    maxWidth: 50,
  },
  deleteButton: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "#ef4444",
    maxWidth: 50,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#9ca3af",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
