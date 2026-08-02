import { animationMediaRoute } from "../media";

export function GET(request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  return animationMediaRoute(request, params, "mp4");
}
