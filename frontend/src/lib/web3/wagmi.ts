import "@rainbow-me/rainbowkit/styles.css";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  arbitrum,
  base,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from "wagmi/chains";

// Custom Etherlink chain configuration
const etherlink = {
  id: 42793,
  name: "Etherlink",
  network: "etherlink",
  nativeCurrency: {
    decimals: 18,
    name: "Tez",
    symbol: "XTZ",
  },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ETHERLINK_RPC!] },
    public: { http: [process.env.NEXT_PUBLIC_ETHERLINK_RPC!] },
  },
  blockExplorers: {
    default: {
      name: "Etherlink Explorer",
      url: "https://explorer.etherlink.com",
    },
  },
};

export const config = getDefaultConfig({
  appName: "Hackers.Market",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [
    mainnet,
    polygon,
    optimism,
    arbitrum,
    base,
    etherlink,
    ...(process.env.NEXT_PUBLIC_ENABLE_TESTNETS === "true" ? [sepolia] : []),
  ],
  ssr: true,
});
