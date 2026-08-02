export const FLAP_MECHANICS = {
  birdRadius: 12,
  birdX: 88,
  gameHeight: 576,
  gameWidth: 352,
  groundHeight: 64,
  jumpHeight: 48,
  pipeColliderOffsetX: 4,
  pipeColliderWidth: 56,
  pipeSpawnBuffer: 50,
  pipeSpawnIntervalSeconds: 1.5,
  pipeSpeed: 240,
  timeToApex: 0.35,
} as const;

export const FLAP_GRAVITY = (2 * FLAP_MECHANICS.jumpHeight) / FLAP_MECHANICS.timeToApex ** 2;
export const FLAP_THRUST = FLAP_GRAVITY * FLAP_MECHANICS.timeToApex;

export function advanceBird(y: number, velocity: number, delta: number) {
  const nextVelocity = velocity + FLAP_GRAVITY * delta;
  return { velocity: nextVelocity, y: y + nextVelocity * delta };
}

export function createPipeGapCenter(random: () => number) {
  const half = (FLAP_MECHANICS.gameHeight - FLAP_MECHANICS.groundHeight) / 2;
  const spread = FLAP_MECHANICS.pipeSpawnBuffer * 2;
  return Math.floor(half - spread + random() * spread * 2);
}

function circleRectangleIntersects(
  circleX: number,
  circleY: number,
  radius: number,
  rectangleX: number,
  rectangleY: number,
  rectangleWidth: number,
  rectangleHeight: number,
) {
  const testX = Math.max(rectangleX, Math.min(circleX, rectangleX + rectangleWidth));
  const testY = Math.max(rectangleY, Math.min(circleY, rectangleY + rectangleHeight));
  const distanceX = circleX - testX;
  const distanceY = circleY - testY;
  return Math.sqrt(distanceX * distanceX + distanceY * distanceY) <= radius;
}

export function birdCollides(
  y: number,
  pipePairs: ReadonlyArray<{ gapCenter: number; x: number }>,
) {
  const groundY = FLAP_MECHANICS.gameHeight - FLAP_MECHANICS.groundHeight;
  if (
    circleRectangleIntersects(
      FLAP_MECHANICS.birdX,
      y,
      FLAP_MECHANICS.birdRadius,
      0,
      groundY,
      FLAP_MECHANICS.gameWidth,
      FLAP_MECHANICS.groundHeight,
    )
  )
    return true;
  return pipePairs.some((pipe) => {
    const gapTop = pipe.gapCenter - FLAP_MECHANICS.pipeSpawnBuffer;
    const gapBottom = pipe.gapCenter + FLAP_MECHANICS.pipeSpawnBuffer;
    const colliderX = pipe.x + FLAP_MECHANICS.pipeColliderOffsetX;
    return (
      circleRectangleIntersects(
        FLAP_MECHANICS.birdX,
        y,
        FLAP_MECHANICS.birdRadius,
        colliderX,
        0,
        FLAP_MECHANICS.pipeColliderWidth,
        gapTop,
      ) ||
      circleRectangleIntersects(
        FLAP_MECHANICS.birdX,
        y,
        FLAP_MECHANICS.birdRadius,
        colliderX,
        gapBottom,
        FLAP_MECHANICS.pipeColliderWidth,
        FLAP_MECHANICS.gameHeight - gapBottom,
      )
    );
  });
}

export function pipeCrossedBird(pipeX: number) {
  return pipeX + 32 < FLAP_MECHANICS.birdX;
}
