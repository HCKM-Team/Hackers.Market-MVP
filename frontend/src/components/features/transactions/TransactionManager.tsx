"use client";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTransactionStore } from "@/lib/web3/store/transactionStore";
import { filterTransactions } from "@/lib/web3/utils/transactions";
import { TransactionFilters } from "./TransactionFilters";
import { ActiveTransactionsList } from "./ActiveTransactionsList";
import { TransactionHistory } from "./TransactionHistory";

export function TransactionManager() {
  const { transactions, filters } = useTransactionStore();
  const [view, setView] = useState<"active" | "history">("active");

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, filters),
    [transactions, filters]
  );

  return (
    <div className="space-y-4">
      <TransactionFilters />

      <Tabs
        value={view}
        onValueChange={(value) => setView(value as "active" | "history")}
      >
        <TabsList>
          <TabsTrigger value="active">Active Trades</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <ActiveTransactionsList
            transactions={filteredTransactions.filter((tx: any) =>
              ["funded", "locked"].includes(tx.status)
            )}
          />
        </TabsContent>

        <TabsContent value="history">
          <TransactionHistory
            transactions={filteredTransactions.filter((tx: any) =>
              ["completed", "disputed", "cancelled"].includes(tx.status)
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
