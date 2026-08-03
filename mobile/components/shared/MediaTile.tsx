import React from "react";
import { View, StyleSheet, Pressable, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { Image, ImageContentFit } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { isVideoUrl, videoPosterUrl } from "@/utils/media";

interface MediaTileProps {
  /** Cloudinary URL or local picker URI. Images and videos both welcome. */
  uri: string;
  style?: StyleProp<ViewStyle & ImageStyle>;
  contentFit?: ImageContentFit;
  /**
   * Render videos as a still frame with a play badge instead of a live player.
   * Use in lists and grids — a screen full of AVPlayers is expensive, and the
   * user is picking something to open, not watching yet.
   */
  posterOnly?: boolean;
  /** Start playing as soon as the player is ready. Ignored when posterOnly. */
  autoPlay?: boolean;
  onPress?: () => void;
}

/**
 * One media item — an image or a video — from a URL alone.
 *
 * Media arrays across the app are plain `string[]` with no type field; the kind
 * is read off the URL (see utils/media.ts). Everything that renders user media
 * goes through here so images and videos never need separate call sites.
 */
export default function MediaTile({
  uri,
  style,
  contentFit = "cover",
  posterOnly = false,
  autoPlay = false,
  onPress,
}: MediaTileProps) {
  const isVideo = isVideoUrl(uri);
  const showPlayer = isVideo && !posterOnly;

  const content = showPlayer ? (
    <VideoPlayerTile uri={uri} style={style} autoPlay={autoPlay} />
  ) : isVideo ? (
    <VideoPoster uri={uri} style={style} contentFit={contentFit} />
  ) : (
    <Image source={{ uri }} style={style} contentFit={contentFit} />
  );

  if (!onPress) return <>{content}</>;
  return (
    <Pressable onPress={onPress} style={styles.pressable}>
      {content}
    </Pressable>
  );
}

/**
 * Still frame + play badge. A local video that hasn't been uploaded yet has no
 * derivable poster, so it falls back to a dark tile — the badge is what tells
 * the user it's a video either way.
 */
function VideoPoster({
  uri,
  style,
  contentFit,
}: {
  uri: string;
  style?: StyleProp<ViewStyle & ImageStyle>;
  contentFit: ImageContentFit;
}) {
  const poster = videoPosterUrl(uri);
  return (
    <View style={[style, styles.posterWrap]}>
      {poster ? (
        <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.posterFallback]} />
      )}
      <View style={styles.playBadge}>
        <Ionicons name="play" size={16} color="#fff" />
      </View>
    </View>
  );
}

function VideoPlayerTile({
  uri,
  style,
  autoPlay,
}: {
  uri: string;
  style?: StyleProp<ViewStyle & ImageStyle>;
  autoPlay: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    if (autoPlay) {
      p.muted = true; // Autoplay with sound is hostile in a feed.
      p.play();
    }
  });

  return (
    <VideoView
      style={style as StyleProp<ViewStyle>}
      player={player}
      nativeControls
      contentFit="contain"
      allowsFullscreen
    />
  );
}

const styles = StyleSheet.create({
  pressable: {
    position: "relative",
  },
  posterWrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  posterFallback: {
    backgroundColor: "#1a1a1a",
  },
  playBadge: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    // Optical centering — the play glyph's mass sits left of its box.
    paddingLeft: 2,
  },
});
