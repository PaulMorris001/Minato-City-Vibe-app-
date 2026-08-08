import { useState } from "react";
import type { ImageLoadEventData } from "expo-image";

/**
 * Clamp for poster cards, as width/height.
 *
 * Event posters are flyers: mostly portrait, and a fair number are full 9:16
 * story exports. Letting a card follow those all the way would hand a single
 * event most of the screen, so the tall end stops at 3:5. The wide end sits
 * just past square — a landscape photo used as a poster still reads as a card,
 * not a banner.
 */
const MIN_RATIO = 0.6;
const MAX_RATIO = 1.2;

/**
 * Sizes a poster card to the image it contains.
 *
 * Spread `style` onto the card (last, so it wins) and pass `onLoad` to the
 * <Image>. Until the image reports its dimensions `style` is null and the
 * card's own fixed height applies, so there is no jump to zero height and no
 * layout shift for cards whose image fails to load.
 *
 * Cards that share a horizontal rail should NOT use this — a row of differing
 * heights reads as broken. It is for vertical feeds, where varying heights are
 * the normal look.
 */
export function usePosterAspect(min = MIN_RATIO, max = MAX_RATIO) {
  const [ratio, setRatio] = useState<number | null>(null);

  const onLoad = (e: ImageLoadEventData) => {
    const { width, height } = e.source ?? {};
    if (!width || !height) return;
    setRatio(Math.min(Math.max(width / height, min), max));
  };

  // `height: undefined` is load-bearing: RN honours an explicit height over
  // aspectRatio, so the fallback height has to be cleared for the ratio to win.
  const style = ratio ? { height: undefined, aspectRatio: ratio } : null;

  return { onLoad, style };
}
