"use client";

import React from "react";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LogOut, Copy, ExternalLink, User, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface CustomConnectBtnProps {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function CustomConnectBtn({
  className,
  variant = "default",
  size = "default",
}: CustomConnectBtnProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  const handleCopyAddress = async () => {
    if (address) {
      try {
        await navigator.clipboard.writeText(address);
        toast.success("Address copied to clipboard");
      } catch (error) {
        toast.error("Failed to copy address");
      }
    }
  };

  const handleViewOnExplorer = () => {
    if (address) {
      // You can customize this URL based on the chain
      const explorerUrl = `https://etherscan.io/address/${address}`;
      window.open(explorerUrl, "_blank");
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          authenticationStatus,
          mounted,
        }) => {
          const ready = mounted && authenticationStatus !== "loading";
          const connected =
            ready &&
            account &&
            chain &&
            (!authenticationStatus || authenticationStatus === "authenticated");

          return (
            <div
              {...(!ready && {
                "aria-hidden": true,
                style: {
                  opacity: 0,
                  pointerEvents: "none",
                  userSelect: "none",
                },
              })}
            >
              {(() => {
                if (!connected) {
                  return (
                    <Button
                      onClick={openConnectModal}
                      size="sm"
                      className={cn(
                        "bg-[#2DD4BF] text-black hover:bg-[#2DD4BF]/80",
                        className
                      )}
                    >
                      Connect Wallet
                    </Button>
                  );
                }

                if (chain.unsupported) {
                  return (
                    <Button
                      onClick={openChainModal}
                      variant="destructive"
                      size={size}
                      className={cn("gap-2", className)}
                    >
                      Wrong network
                    </Button>
                  );
                }

                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={variant}
                        size={size}
                        className={cn("gap-2", className)}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            {chain.hasIcon && (
                              <div
                                style={{
                                  background: chain.iconBackground,
                                  width: 12,
                                  height: 12,
                                  borderRadius: 999,
                                  overflow: "hidden",
                                  marginRight: 4,
                                }}
                              >
                                {chain.iconUrl && (
                                  <img
                                    alt={chain.name ?? "Chain icon"}
                                    src={chain.iconUrl}
                                    style={{ width: 12, height: 12 }}
                                  />
                                )}
                              </div>
                            )}
                            <span className="hidden sm:inline-block">
                              {formatAddress(account.address)}
                            </span>
                          </div>
                          <ChevronDown className="h-3 w-3" />
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem
                        onClick={openAccountModal}
                        className="cursor-pointer"
                      >
                        <User className="mr-2 h-4 w-4" />
                        Account
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={openChainModal}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {chain.hasIcon && (
                            <div
                              style={{
                                background: chain.iconBackground,
                                width: 16,
                                height: 16,
                                borderRadius: 999,
                                overflow: "hidden",
                              }}
                            >
                              {chain.iconUrl && (
                                <img
                                  alt={chain.name ?? "Chain icon"}
                                  src={chain.iconUrl}
                                  style={{ width: 16, height: 16 }}
                                />
                              )}
                            </div>
                          )}
                          <span>{chain.name}</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleCopyAddress}
                        className="cursor-pointer"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy Address
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleViewOnExplorer}
                        className="cursor-pointer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View on Explorer
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => disconnect()}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("gap-2", className)}
        >
          <div className="flex items-center gap-2">
            <Avatar>
              <AvatarImage
                src={`https://api.dicebear.com/9.x/avataaars-neutral/svg?seed=${address}`}
              />
              <AvatarFallback>
                {formatAddress(address!).slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline-block">
              {formatAddress(address!)}
            </span>
            <ChevronDown className="h-3 w-3" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={handleCopyAddress}
          className="cursor-pointer"
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy Address
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleViewOnExplorer}
          className="cursor-pointer"
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          View on Explorer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => disconnect()}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
