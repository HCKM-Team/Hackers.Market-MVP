import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useEscrowStore } from "@/store";
import { Escrow, UpdateEscrowParams } from "@/lib/web3/types/Escrow";
import { updateEscrowOnChain } from "@/lib/web3/utils/escrow";
import { toast } from "sonner";

export function useOptimisticEscrowUpdate() {
  const queryClient = useQueryClient();
  const { updateEscrow } = useEscrowStore();

  const mutation = useMutation({
    mutationFn: async (params: UpdateEscrowParams) => {
      const result = await updateEscrowOnChain(params);
      return result;
    },

    onMutate: async (params) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries(["escrow", params.id]);

      // Snapshot previous value
      const previousEscrow = queryClient.getQueryData<Escrow>([
        "escrow",
        params.id,
      ]);

      // Optimistically update
      queryClient.setQueryData(["escrow", params.id], (old: Escrow) => ({
        ...old,
        ...params.updates,
        updating: true,
      }));

      // Update local store
      updateEscrow(params.id, params.updates);

      return { previousEscrow };
    },

    onError: (err, params, context) => {
      // Rollback on error
      if (context?.previousEscrow) {
        queryClient.setQueryData(["escrow", params.id], context.previousEscrow);
        updateEscrow(params.id, context.previousEscrow);
      }

      toast.error("Failed to update escrow");
    },

    onSettled: (data, error, params) => {
      // Always refetch after mutation
      queryClient.invalidateQueries(["escrow", params.id]);
    },
  });

  return mutation;
}
