import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SessionState {
  currentChannel: string | null;
  isLive: boolean;
  participants: number;
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'disconnected';
}

const initialState: SessionState = {
  currentChannel: null,
  isLive: false,
  participants: 0,
  connectionStatus: 'idle',
};

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setCurrentChannel: (state, action: PayloadAction<string | null>) => {
      state.currentChannel = action.payload;
    },
    setLive: (state, action: PayloadAction<boolean>) => {
      state.isLive = action.payload;
    },
    setParticipants: (state, action: PayloadAction<number>) => {
      state.participants = action.payload;
    },
    setConnectionStatus: (
      state,
      action: PayloadAction<SessionState['connectionStatus']>
    ) => {
      state.connectionStatus = action.payload;
    },
    resetSession: (state) => {
      state.currentChannel = null;
      state.isLive = false;
      state.participants = 0;
      state.connectionStatus = 'idle';
    },
  },
});

export const {
  setCurrentChannel,
  setLive,
  setParticipants,
  setConnectionStatus,
  resetSession,
} = sessionSlice.actions;

export default sessionSlice.reducer;
