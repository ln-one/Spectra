"use client";

import MuxPlayer from "@mux/mux-player-react";
import styles from "./AnimationPlayer.module.css";

export function AnimationPlayer({
  height,
  src,
  title,
  width,
}: {
  height: number;
  src: string;
  title: string;
  width: number;
}) {
  return (
    <div className={styles.stage} data-testid="animation-player-stage">
      <MuxPlayer
        accentColor="#4ade80"
        className={styles.player ?? ""}
        disableCookies
        disablePictureInPicture
        disableTracking
        noMutedPref
        noVolumePref
        playbackRates={[0.5, 0.75, 1, 1.25, 1.5, 2]}
        playsInline
        preload="metadata"
        src={src}
        streamType="on-demand"
        style={{ aspectRatio: width / height }}
        title={title}
      />
    </div>
  );
}
