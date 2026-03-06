"use client";

import Image from "next/image";

interface AIAvatarProps {
  src: string;
  name: string;
  size?: number;
  className?: string;
}

export default function AIAvatar({ src, name, size = 24, className = "" }: AIAvatarProps) {
  return (
    <Image
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`rounded-full object-contain ${className}`}
      unoptimized
    />
  );
}
