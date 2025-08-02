import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Escrow, EscrowFilters, SortOption } from "@/lib/web3/types/Escrow";
import { defaultFilters } from "@/lib/web3/utils/escrow";
import {
  UserProfile,
  UserPreferences,
  ReputationScore,
} from "@/lib/web3/types/User";
import { Notification } from "@/lib/web3/types/Notification";
import { TransactionState } from "@/lib/web3/types/Transaction";
import { UIState } from "@/lib/web3/types/UI";

interface RootState {
  user: UserState;
  escrow: EscrowState;
  transaction: TransactionState;
  ui: UIState;
}

// User Store
interface UserState {
  profile: UserProfile | null;
  preferences: UserPreferences;
  reputation: ReputationScore;
  notifications: Notification[];
}

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  preferences: getStoredPreferences(),
  reputation: { score: 0, level: "unverified" },
  notifications: [],

  setProfile: (profile: UserProfile) => set({ profile }),
  updatePreferences: (prefs: Partial<UserPreferences>) =>
    set((state) => ({
      preferences: { ...state.preferences, ...prefs },
    })),

  addNotification: (notification: Notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 50),
    })),
}));

// Escrow Store with Persistence
interface EscrowState {
  activeEscrows: Escrow[];
  escrowHistory: Escrow[];
  filters: EscrowFilters;
  sortBy: SortOption;
}

export const useEscrowStore = create<EscrowState>()(
  persist(
    (set, get) => ({
      activeEscrows: [],
      escrowHistory: [],
      filters: defaultFilters,
      sortBy: "createdAt",

      addEscrow: (escrow: Escrow) =>
        set((state) => ({
          activeEscrows: [...state.activeEscrows, escrow],
        })),

      updateEscrow: (id: string, updates: Partial<Escrow>) =>
        set((state) => ({
          activeEscrows: state.activeEscrows.map((e) =>
            e.id === id ? { ...e, ...updates } : e
          ),
        })),

      moveToHistory: (id: string) =>
        set((state) => {
          const escrow = state.activeEscrows.find((e) => e.id === id);
          if (!escrow) return state;

          return {
            activeEscrows: state.activeEscrows.filter((e) => e.id !== id),
            escrowHistory: [escrow, ...state.escrowHistory],
          };
        }),
    }),
    {
      name: "escrow-storage",
      partialize: (state) => ({
        escrowHistory: state.escrowHistory.slice(0, 100),
      }),
    }
  )
);
