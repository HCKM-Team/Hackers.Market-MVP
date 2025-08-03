import { useMemo, useRef } from "react";
import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchEscrows } from "@/lib/web3/utils/escrow";
import { EscrowFilters } from "@/lib/web3/types/Escrow";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Spinner } from "@/components/ui/spinner";
import { EscrowCard } from "@/components/features/escrow/EscrowCard";

export function useInfiniteEscrows(filters: EscrowFilters) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
    queryKey: ["escrows", filters],
    queryFn: ({ pageParam = 0 }) =>
      fetchEscrows({ ...filters, offset: pageParam, limit: 20 }),
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * 20 : undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
    cacheTime: 1000 * 60 * 30, // 30 minutes
  });

  const escrows = useMemo(
    () => data?.pages.flatMap((page) => page.escrows) ?? [],
    [data]
  );

  return {
    escrows,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  };
}

// Virtualized list component
export function EscrowList({ filters }: { filters: EscrowFilters }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { escrows, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteEscrows(filters);

  const rowVirtualizer = useVirtualizer({
    count: escrows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  useEffect(() => {
    const lastItem = rowVirtualizer.getVirtualItems().at(-1);

    if (
      lastItem &&
      lastItem.index >= escrows.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    rowVirtualizer.getVirtualItems(),
    escrows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <EscrowCard escrow={escrows[virtualItem.index]} />
          </div>
        ))}
      </div>

      {isFetchingNextPage && (
        <div className="p-4 text-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
