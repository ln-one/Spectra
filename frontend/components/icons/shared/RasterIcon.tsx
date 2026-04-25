import Image from "next/image";
import type { AppIconProps } from "./icon-types";

interface RasterIconProps extends AppIconProps {
  src: string;
  alt?: string;
  width: number;
  height: number;
}

export function RasterIcon({
  src,
  alt = "",
  width,
  height,
  className,
  style,
  title,
}: RasterIconProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      title={title}
    />
  );
}
