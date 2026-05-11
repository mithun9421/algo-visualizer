"use client";

import { create } from "zustand";
import { initialState, reducer, type PlayerAction, type PlayerState } from "./reducer";

interface PlayerStore {
  state: PlayerState;
  dispatch: (action: PlayerAction) => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  state: initialState,
  dispatch: (action) => set({ state: reducer(get().state, action) }),
}));
