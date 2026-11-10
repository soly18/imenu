import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EmployeeSummary, Language } from '@imenu25/shared';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  employee: EmployeeSummary | null;
  isAuthenticated: boolean;
  setAuth: (tokens: { accessToken: string; refreshToken: string }, employee: EmployeeSummary) => void;
  setTokens: (accessToken: string, refreshToken: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      employee: null,
      isAuthenticated: false,

      setAuth: (tokens, employee) => set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        employee,
        isAuthenticated: true,
      }),

      setTokens: (accessToken, refreshToken) => set((s) => ({
        accessToken,
        refreshToken: refreshToken ?? s.refreshToken,
      })),

      logout: () => set({
        accessToken: null,
        refreshToken: null,
        employee: null,
        isAuthenticated: false,
      }),
    }),
    {
      name: 'imenu25-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        employee: s.employee,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
);
