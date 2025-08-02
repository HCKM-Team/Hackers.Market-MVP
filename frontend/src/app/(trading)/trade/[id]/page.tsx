import dynamic from "next/dynamic";
import { Suspense } from "react";

// Lazy load heavy components
const TradingChart = dynamic(
  () => import("@/components/features/trading/TradingChart"),
  {
    loading: () => <ChartSkeleton />,
    ssr: false,
  }
);

const OrderBook = dynamic(
  () => import("@/components/features/trading/OrderBook"),
  {
    loading: () => <OrderBookSkeleton />,
  }
);

export default function TradePage({ params }: { params: { id: string } }) {
  return (
    <div className="trading-layout">
      <Suspense fallback={<TradingInfoSkeleton />}>
        <TradingInfo escrowId={params.id} />
      </Suspense>

      <div className="trading-main">
        <TradingChart escrowId={params.id} />
        <OrderBook escrowId={params.id} />
      </div>

      <Suspense fallback={<TradingSidebarSkeleton />}>
        <TradingSidebar escrowId={params.id} />
      </Suspense>
    </div>
  );
}
