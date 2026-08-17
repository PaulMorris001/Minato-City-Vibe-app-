import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { Image, ImageContentFit, ImageLoadEventData } from "expo-image";
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
  /**
   * Mute the player. Defaults to `autoPlay`, because autoplaying with sound is
   * hostile in a feed — but a full-screen viewer the user deliberately opened
   * should pass `muted={false}`, or the video plays silently.
   */
  muted?: boolean;
  /**
   * Size the tile to the photo's own aspect ratio instead of the fixed box in
   * `style`, so a portrait photo gets a taller (or narrower) card rather than
   * having its edges cropped away by `contentFit: "cover"`.
   *
   * - `"height"` keeps the style's width and derives the height. Use in a
   *   vertical layout, where a column of differing heights reads naturally.
   * - `"width"` keeps the style's height and derives the width. Use in a
   *   horizontal strip, where differing heights would look ragged.
   *
   * Until the image reports its dimensions the style's own box applies, so
   * there is no layout jump to zero.
   *
   * Images only — videos keep their fixed box, since a poster frame is not a
   * reliable guide to how the player should be sized.
   */
  adaptive?: "height" | "width";
  /**
   * Aspect-ratio clamp for `adaptive`, as width/height. The low default is 3:4
   * so an ordinary portrait phone photo — much the most common upload — renders
   * uncropped; anything taller (9:16 screenshots, story exports) is cropped to
   * that limit rather than eating the whole screen. The high default is 16:9,
   * which stops a panorama collapsing to a letterbox strip.
   */
  minAspectRatio?: number;
  maxAspectRatio?: number;
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
  muted,
  adaptive,
  minAspectRatio = 3 / 4,
  maxAspectRatio = 16 / 9,
  onPress,
}: MediaTileProps) {
  const isVideo = isVideoUrl(uri);
  const showPlayer = isVideo && !posterOnly;

  // Natural aspect ratio, learned from the decoded image. null until it loads.
  const [ratio, setRatio] = useState<number | null>(null);

  const onLoad = (e: ImageLoadEventData) => {
    const { width, height } = e.source ?? {};
    if (!width || !height) return;
    setRatio(Math.min(Math.max(width / height, minAspectRatio), maxAspectRatio));
  };

  // Clearing the opposite dimension is load-bearing: RN honours an explicit
  // width AND height over aspectRatio, so leaving both set makes the ratio a
  // no-op.
  const adaptiveStyle = !adaptive || !ratio
    ? null
    : adaptive === "height"
      ? { aspectRatio: ratio, height: undefined }
      : { aspectRatio: ratio, width: undefined };

  const content = showPlayer ? (
    <VideoPlayerTile
      uri={uri}
      style={style}
      autoPlay={autoPlay}
      muted={muted ?? autoPlay}
    />
  ) : isVideo ? (
    <VideoPoster uri={uri} style={style} contentFit={contentFit} />
  ) : (
    <Image
      source={{ uri }}
      style={[style, adaptiveStyle]}
      contentFit={contentFit}
      onLoad={adaptive ? onLoad : undefined}
    />
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
  muted,
}: {
  uri: string;
  style?: StyleProp<ViewStyle & ImageStyle>;
  autoPlay: boolean;
  muted: boolean;
}) {
  // `useCaching` lets expo-video keep the file in its own native disk cache, so
  // replaying a clip doesn't re-stream it. Remote URLs only — a local file is
  // already on disk.
  const source = useMemo(
    () => (/^https?:/i.test(uri) ? { uri, useCaching: true } : uri),
    [uri]
  );

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = muted;
    if (autoPlay) p.play();
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
