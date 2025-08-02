import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEscrowStore } from "@/store";
import { socketManager } from "@/lib/socket/client";
import { EscrowUpdate, Escrow } from "@/lib/web3/types/Escrow";
import { toast } from "sonner";
import { Address } from "viem";

// hooks/useRealtimeEscrow.ts
export function useRealtimeEscrow(escrowId: string) {
  const queryClient = useQueryClient();
  const { updateEscrow } = useEscrowStore();

  useEffect(() => {
    const unsubscribe = socketManager.subscribe(
      "escrow:update",
      (data: EscrowUpdate) => {
        if (data.escrowId !== escrowId) return;

        // Update React Query cache
        queryClient.setQueryData(["escrow", escrowId], (old: Escrow) => ({
          ...old,
          ...data.updates,
        }));

        // Update Zustand store
        updateEscrow(escrowId, data.updates);

        // Show notification
        if (data.updates.status === "funded") {
          toast.success("Escrow has been funded!");
        }
      }
    );

    return unsubscribe;
  }, [escrowId, queryClient, updateEscrow]);
}

// hooks/useRealtimePrices.ts
export function useRealtimePrices(tokens: Address[]) {
  const [prices, setPrices] = useState<Record<Address, number>>({});

  useEffect(() => {
    // Subscribe to price updates
    const unsubscribe = socketManager.subscribe(
      "price:update",
      (data: PriceUpdate) => {
        if (tokens.includes(data.token)) {
          setPrices((prev) => ({
            ...prev,
            [data.token]: data.price,
          }));
        }
      }
    );

    // Request initial prices
    socketManager.send("subscribe:prices", { tokens });

    return () => {
      unsubscribe();
      socketManager.send("unsubscribe:prices", { tokens });
    };
  }, [tokens]);

  return prices;
}
