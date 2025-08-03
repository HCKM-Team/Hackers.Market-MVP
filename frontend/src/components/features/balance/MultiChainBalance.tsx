"use client";

import { useAccount } from "wagmi";
import { config } from "@/lib/web3/wagmi";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { ChainBalanceList } from "./ChainBalanceList";
import { OptimalChainSelector } from "./OptimalChainSelector";

interface ChainBalance {
  chainId: number;
  chainName: string;
  nativeBalance: bigint;
  tokenBalances: TokenBalance[];
  usdValue: number;
}

export function MultiChainBalance() {
  const { address } = useAccount();
  const chains = config.chains;

  const balanceQueries = useQueries({
    queries: chains.map((chain) => ({
      queryKey: ["balance", address, chain.id],
      queryFn: () => fetchChainBalance(address, chain.id),
      enabled: !!address,
    })),
  });

  const handleChainSelect = (chainId: number) => {
    // Implement chain selection logic
    console.log("Selected chain:", chainId);
  };

  const totalUsdValue = useMemo(
    () =>
      balanceQueries.reduce(
        (sum, query) => sum + (query.data?.usdValue || 0),
        0
      ),
    [balanceQueries]
  );

  return (
    <Card>
      <CardHeader>
        <h2>Multi-Chain Portfolio</h2>
        <p className="text-2xl font-bold">${totalUsdValue.toLocaleString()}</p>
      </CardHeader>
      <CardContent>
        <ChainBalanceList balances={balanceQueries} />
        <OptimalChainSelector onSelect={handleChainSelect} context="payment" />
      </CardContent>
    </Card>
  );
}
