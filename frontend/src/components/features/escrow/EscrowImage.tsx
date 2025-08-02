// components/features/escrow/EscrowImage.tsx
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

interface EscrowImageProps {
  src: string;
  alt: string;
  priority?: boolean;
}

export function EscrowImage({ src, alt, priority }: EscrowImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  // Use IPFS gateway with image optimization
  const optimizedSrc = src.startsWith("ipfs://")
    ? `${process.env.NEXT_PUBLIC_IPFS_GATEWAY}/ipfs/${src.slice(7)}`
    : src;

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg">
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      ) : (
        <Image
          src={optimizedSrc}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={priority}
          className={cn(
            "object-cover transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setIsLoading(false)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}
