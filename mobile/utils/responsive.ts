import { Dimensions, PixelRatio, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 11 Pro dimensions as reference)
const BASE_WIDTH = 375;
const BASE_HEIGHT = 812;

/**
 * Scales a value based on screen width
 * Useful for horizontal spacing, widths, and margins
 */
export const scaleWidth = (size: number): number => {
  return (SCREEN_WIDTH / BASE_WIDTH) * size;
};

/**
 * Scales a value based on screen height
 * Useful for vertical spacing, heights, and margins
 */
export const scaleHeight = (size: number): number => {
  return (SCREEN_HEIGHT / BASE_HEIGHT) * size;
};

/**
 * Moderately scales a value (less aggressive scaling)
 * Best for font sizes to prevent them from becoming too large or too small
 */
export const moderateScale = (size: number, factor: number = 0.5): number => {
  return size + (scaleWidth(size) - size) * factor;
};

/**
 * Scales font sizes specifically
 * Uses moderate scaling and ensures readability
 */
export const scaleFontSize = (size: number): number => {
  const newSize = moderateScale(size, 0.35);
  if (Platform.OS === 'android') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  }
  return Math.round(newSize);
};

/**
 * Get responsive padding based on screen size
 */
export const getResponsivePadding = (): number => {
  if (SCREEN_WIDTH < 350) return 16; // Very small screens
  if (SCREEN_WIDTH < 400) return 20; // Small screens
  return 24; // Normal screens
};

/**
 * Check if the device is a small screen
 */
export const isSmallScreen = (): boolean => {
  return SCREEN_WIDTH < 375;
};

/**
 * Check if the device is a very small screen
 */
export const isVerySmallScreen = (): boolean => {
  return SCREEN_WIDTH < 350;
};

/**
 * Get responsive button height
 */
export const getButtonHeight = (): number => {
  if (isVerySmallScreen()) return 44;
  if (isSmallScreen()) return 48;
  return 52;
};

/**
 * Get responsive icon size
 */
export const getIconSize = (baseSize: number): number => {
  if (isVerySmallScreen()) return baseSize - 4;
  if (isSmallScreen()) return baseSize - 2;
  return baseSize;
};

// Export screen dimensions
export const screenWidth = SCREEN_WIDTH;
export const screenHeight = SCREEN_HEIGHT;
