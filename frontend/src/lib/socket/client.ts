"use client";

import { io, Socket } from "socket.io-client";
import {
  EscrowUpdate,
  EscrowFunded,
  EscrowReleased,
  EmergencyActivated,
  PriceUpdate,
} from "@/lib/web3/types/Escrow";

class SocketManager {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private subscribers = new Map<string, Set<Function>>();

  connect(token: string) {
    if (this.socket?.connected) return;

    this.socket = io(process.env.NEXT_PUBLIC_SOCKET_URL!, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("Socket connected");
      this.reconnectAttempts = 0;
      this.emit("connected", true);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
      this.emit("connected", false);

      if (reason === "io server disconnect") {
        this.attemptReconnect();
      }
    });

    // Escrow events
    this.socket.on("escrow:update", (data: EscrowUpdate) => {
      this.emit("escrow:update", data);
    });

    this.socket.on("escrow:funded", (data: EscrowFunded) => {
      this.emit("escrow:funded", data);
    });

    this.socket.on("escrow:released", (data: EscrowReleased) => {
      this.emit("escrow:released", data);
    });

    // Emergency events
    this.socket.on("emergency:activated", (data: EmergencyActivated) => {
      this.emit("emergency:activated", data);
    });

    // Price updates
    this.socket.on("price:update", (data: PriceUpdate) => {
      this.emit("price:update", data);
    });
  }

  subscribe(event: string, handler: Function) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event)!.add(handler);

    return () => {
      this.subscribers.get(event)?.delete(handler);
    };
  }

  private emit(event: string, data: any) {
    this.subscribers.get(event)?.forEach((handler) => handler(data));
  }

  send(event: string, data: any) {
    if (!this.socket?.connected) {
      console.warn("Socket not connected");
      return;
    }

    this.socket.emit(event, data);
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketManager = new SocketManager();
