import { useAccount } from "wagmi";
import { useQueries } from "@tanstack/react-query";
import { useMemo, useCallback } from "react";
import { Hex } from "viem";
import { getProvider } from "@/lib/web3/utils/provider";
import { updateTransactionStatus } from "@/lib/web3/utils/transactions";
import { config } from "@/lib/web3/wagmi";

export function useMultiChainTransactions() {
  const { address } = useAccount();
  const supportedChains = config.chains;

  const transactionQueries = useQueries({
    queries: supportedChains.map((chain) => ({
      queryKey: ["transactions", address, chain.id],
      queryFn: () => fetchChainTransactions(address!, chain.id),
      enabled: !!address,
    })),
  });

  const allTransactions = useMemo(() => {
    const txs = transactionQueries
      .filter((q) => q.isSuccess)
      .flatMap((q) => q.data || []);

    return txs.sort((a: any, b: any) => b.timestamp - a.timestamp);
  }, [transactionQueries]);

  const pendingTransactions = useMemo(
    () => allTransactions.filter((tx: any) => tx.status === "pending"),
    [allTransactions]
  );

  const watchTransaction = useCallback((hash: Hex, chainId: number) => {
    const provider = getProvider(chainId);

    return new Promise((resolve, reject) => {
      provider
        .waitForTransaction(hash)
        .then((receipt: any) => {
          // Update local state
          updateTransactionStatus(hash, "confirmed");
          resolve(receipt);
        })
        .catch(reject);
    });
  }, []);

  return {
    transactions: allTransactions,
    pendingTransactions,
    watchTransaction,
    isLoading: transactionQueries.some((q) => q.isLoading),
  };
}
