"use client";

import { useState } from "react";
import { Info, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function KYCBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="bg-[#2DD4BF] px-4 py-3 text-black">
      <div className="flex gap-2">
        <div className="flex grow gap-3">
          <Info
            className="mt-0.5 shrink-0 opacity-60 text-teal-800"
            size={16}
            aria-hidden="true"
          />
          <div className="flex grow flex-col justify-between gap-2 md:flex-row">
            <p className="text-sm">
              Complete KYC to start buying and selling. It takes less than 5
              minutes.
            </p>
            <a href="#" className="group text-sm font-medium whitespace-nowrap">
              Start KYC verification
            </a>
          </div>
        </div>
        <Button
          variant="ghost"
          className="group -my-1.5 -me-2 size-8 shrink-0 p-0 hover:bg-transparent"
          onClick={() => setIsVisible(false)}
          aria-label="Close banner"
        >
          <XIcon
            size={16}
            className="opacity-60 transition-opacity group-hover:opacity-100 text-teal-800"
            aria-hidden="true"
          />
        </Button>
      </div>
    </div>
  );
}
