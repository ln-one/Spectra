import type { z } from "zod";
import type { gameSkinSchema } from "../contract";
import { createSeededRandom } from "../random";
import {
  advanceBird,
  birdCollides,
  createPipeGapCenter,
  FLAP_MECHANICS,
  FLAP_THRUST,
  pipeCrossedBird,
} from "./mechanics";

const FLAP_WIDTH = FLAP_MECHANICS.gameWidth;
const FLAP_HEIGHT = FLAP_MECHANICS.gameHeight;
const GROUND_HEIGHT = FLAP_MECHANICS.groundHeight;
const PIPE_SPEED = FLAP_MECHANICS.pipeSpeed;
const PIPE_INTERVAL = FLAP_MECHANICS.pipeSpawnIntervalSeconds;
const PIPE_BUFFER = FLAP_MECHANICS.pipeSpawnBuffer;
const BIRD_X = FLAP_MECHANICS.birdX;

type Skin = z.infer<typeof gameSkinSchema>;
type PipePair = { cleared: boolean; gapCenter: number; x: number };

export type FlapRuntime = {
  destroy(): void;
  flap(): void;
  pause(): void;
  ready: Promise<void>;
  resumeAfterRevival(): void;
  start(): void;
};

export type FlapRuntimeOptions = {
  onDeath: (summary: { elapsedMs: number; flapCount: number; score: number }) => void;
  onPause?: () => void;
  onScore: (score: number) => void;
  seed: string;
  skin: Skin;
};

const SKIN_ASSETS: Record<Skin, { background: string; bird: string; tiles: string }> = {
  skyline_day: {
    background: "/game-assets/flap-revival/skyline-day.png",
    bird: "/game-assets/flap-revival/bird-day.png",
    tiles: "/game-assets/flap-revival/tiles-day.png",
  },
  city_sunset: {
    background: "/game-assets/flap-revival/city-sunset.png",
    bird: "/game-assets/flap-revival/bird-sunset.png",
    tiles: "/game-assets/flap-revival/tiles-sunset.png",
  },
  city_night: {
    background: "/game-assets/flap-revival/city-night.png",
    bird: "/game-assets/flap-revival/bird-night.png",
    tiles: "/game-assets/flap-revival/tiles-night.png",
  },
};

function loadImage(source: string) {
  const image = new Image();
  const ready = new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error(`flap_asset_load_failed:${source}`)), {
      once: true,
    });
  });
  image.src = source;
  return { image, ready };
}

function canvasContext(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("flap_canvas_context_unavailable");
  return context;
}

export function createFlapRuntime(
  canvas: HTMLCanvasElement,
  options: FlapRuntimeOptions,
): FlapRuntime {
  const context = canvasContext(canvas);
  canvas.width = FLAP_WIDTH;
  canvas.height = FLAP_HEIGHT;
  context.imageSmoothingEnabled = false;
  const assets = SKIN_ASSETS[options.skin];
  const backgroundAsset = loadImage(assets.background);
  const birdAsset = loadImage(assets.bird);
  const tileAsset = loadImage(assets.tiles);
  const background = backgroundAsset.image;
  const birdImage = birdAsset.image;
  const tileImage = tileAsset.image;
  const ready = Promise.all([backgroundAsset.ready, birdAsset.ready, tileAsset.ready]).then(
    () => undefined,
  );
  const random = createSeededRandom(options.seed);
  let raf = 0;
  let last = performance.now();
  let startedAt = last;
  let state: "idle" | "playing" | "paused" | "dead" | "destroyed" = "idle";
  let birdY = FLAP_HEIGHT / 2;
  let birdVelocity = 0;
  let rotation = 0;
  let pipes: PipePair[] = [];
  let spawnAccumulator = 0;
  let score = 0;
  let flapCount = 0;
  let protectionUntil = 0;
  let assetsReady = false;
  ready.then(
    () => {
      assetsReady = true;
    },
    () => undefined,
  );

  function drawPipe(pipe: PipePair) {
    const gapTop = pipe.gapCenter - PIPE_BUFFER;
    const gapBottom = pipe.gapCenter + PIPE_BUFFER;
    const lowerHeight = FLAP_HEIGHT - GROUND_HEIGHT - gapBottom;
    context.fillStyle =
      options.skin === "city_night"
        ? "#8bd450"
        : options.skin === "city_sunset"
          ? "#ef8f3c"
          : "#55b949";
    context.fillRect(pipe.x, 0, 64, gapTop);
    context.fillRect(pipe.x, gapBottom, 64, lowerHeight);
    if (tileImage.complete && tileImage.naturalWidth > 0) {
      context.drawImage(tileImage, 0, 0, 64, 32, pipe.x, Math.max(0, gapTop - 24), 64, 32);
      context.drawImage(tileImage, 0, 32, 64, 32, pipe.x, gapBottom, 64, 32);
    }
  }

  function draw() {
    context.clearRect(0, 0, FLAP_WIDTH, FLAP_HEIGHT);
    if (background.complete && background.naturalWidth > 0) {
      context.drawImage(
        background,
        0,
        0,
        background.naturalWidth,
        background.naturalHeight,
        0,
        0,
        FLAP_WIDTH,
        FLAP_HEIGHT,
      );
    } else {
      context.fillStyle =
        options.skin === "city_night"
          ? "#10142d"
          : options.skin === "city_sunset"
            ? "#ef8d68"
            : "#79cbe8";
      context.fillRect(0, 0, FLAP_WIDTH, FLAP_HEIGHT);
    }
    for (const pipe of pipes) drawPipe(pipe);
    context.fillStyle = options.skin === "city_night" ? "#293047" : "#d9b46f";
    context.fillRect(0, FLAP_HEIGHT - GROUND_HEIGHT, FLAP_WIDTH, GROUND_HEIGHT);
    context.save();
    context.translate(BIRD_X, birdY);
    context.rotate((rotation * Math.PI) / 180);
    if (birdImage.complete && birdImage.naturalWidth > 0) {
      context.drawImage(birdImage, 0, 0, 16, 16, -16, -16, 32, 32);
    } else {
      context.fillStyle = "#ffe65b";
      context.beginPath();
      context.arc(0, 0, 14, 0, Math.PI * 2);
      context.fill();
    }
    if (performance.now() < protectionUntil) {
      context.strokeStyle = "rgba(255,255,255,.9)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 20, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  function update(delta: number, now: number) {
    const bird = advanceBird(birdY, birdVelocity, delta);
    birdVelocity = bird.velocity;
    birdY = bird.y;
    rotation =
      birdVelocity < 0
        ? Math.max(-25, -25 * (birdVelocity / -FLAP_THRUST))
        : Math.min(50, 50 * (birdVelocity / FLAP_THRUST));
    spawnAccumulator += delta;
    if (spawnAccumulator >= PIPE_INTERVAL) {
      spawnAccumulator = 0;
      pipes.push({ cleared: false, gapCenter: createPipeGapCenter(random), x: FLAP_WIDTH });
    }
    for (const pipe of pipes) pipe.x -= PIPE_SPEED * delta;
    pipes = pipes.filter((pipe) => pipe.x > -64);
    const protectedNow = now < protectionUntil;
    const safeGroundY = FLAP_HEIGHT - GROUND_HEIGHT - FLAP_MECHANICS.birdRadius;
    if (protectedNow && birdY > safeGroundY) {
      birdY = safeGroundY;
      birdVelocity = 0;
    }
    if (!protectedNow && birdCollides(birdY, pipes)) {
      state = "dead";
      options.onDeath({ elapsedMs: Math.max(0, Math.round(now - startedAt)), flapCount, score });
      return;
    }
    for (const pipe of pipes) {
      if (!pipe.cleared && pipeCrossedBird(pipe.x)) {
        pipe.cleared = true;
        if (!protectedNow) {
          score += 1;
          options.onScore(score);
        }
      }
    }
  }

  function frame(now: number) {
    if (state === "destroyed") return;
    const delta = Math.min(1000, now - last) / 1000;
    last = now;
    if (state === "playing") update(delta, now);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function flap() {
    if (!assetsReady) return;
    if (state === "idle") {
      startedAt = performance.now();
      last = startedAt;
      state = "playing";
    }
    if (state !== "playing") return;
    flapCount += 1;
    birdVelocity = -FLAP_THRUST;
  }

  function pointer(event: PointerEvent) {
    event.preventDefault();
    flap();
  }

  function keyboard(event: KeyboardEvent) {
    if (event.code !== "Space") return;
    event.preventDefault();
    flap();
  }

  function visibility() {
    if (document.hidden && state === "playing") {
      state = "paused";
      options.onPause?.();
    }
  }

  canvas.addEventListener("pointerdown", pointer);
  window.addEventListener("keydown", keyboard);
  document.addEventListener("visibilitychange", visibility);
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      state = "destroyed";
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", keyboard);
      document.removeEventListener("visibilitychange", visibility);
    },
    flap,
    pause() {
      if (state === "playing") {
        state = "paused";
        options.onPause?.();
      }
    },
    ready,
    resumeAfterRevival() {
      if (state !== "dead" && state !== "paused") return;
      birdY = FLAP_HEIGHT / 2;
      birdVelocity = 0;
      rotation = 0;
      pipes = pipes.filter((pipe) => pipe.x < -64 || pipe.x > BIRD_X + 190);
      protectionUntil = performance.now() + 1500;
      last = performance.now();
      state = "playing";
    },
    start() {
      if (!assetsReady) return;
      if (state !== "idle" && state !== "paused") return;
      if (state === "idle") startedAt = performance.now();
      last = performance.now();
      state = "playing";
    },
  };
}
