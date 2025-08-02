import { useCallback, useMemo } from "react";
import { Address } from "viem";
import { useChainId } from "wagmi";
import { EscrowImplementationABI } from "@/lib/web3/abis/EscrowImplementation";
import { EscrowImplementation } from "@/lib/web3/types/EscrowImplementation";
import { CreateEscrowParams } from "@/lib/web3/types/Escrow";

export function useEscrowContract(address: Address) {
  const { data: signer } = useSigner();
  const chainId = useChainId();

  const contract = useMemo(() => {
    if (!signer || !address) return null;

    return new Contract(
      address,
      EscrowImplementationABI,
      signer
    ) as EscrowImplementation;
  }, [address, signer]);

  const createEscrow = useCallback(
    async (params: CreateEscrowParams) => {
      if (!contract) throw new Error("Contract not initialized");

      const tx = await contract.createEscrow(
        params.buyer,
        params.amount,
        params.currency,
        params.deliveryTime,
        params.metadata
      );

      return tx.wait();
    },
    [contract]
  );

  const fundEscrow = useCallback(
    async (amount: bigint) => {
      if (!contract) throw new Error("Contract not initialized");

      const tx = await contract.fundEscrow({ value: amount });
      return tx.wait();
    },
    [contract]
  );

  const releaseEscrow = useCallback(async () => {
    if (!contract) throw new Error("Contract not initialized");

    const tx = await contract.release();
    return tx.wait();
  }, [contract]);

  return {
    contract,
    createEscrow,
    fundEscrow,
    releaseEscrow,
    // ... other methods
  };
}
