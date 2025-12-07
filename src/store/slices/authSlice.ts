import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UserState {
  uid?: string;
  name?: string;
  email?: string;
  role?: 'sender'|'receiver';
  loading: boolean;
}

const initialState: UserState = { loading: true };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<Partial<UserState>>) {
      Object.assign(state, action.payload, { loading: false });
    },
    clearUser(state) {
      state.uid = undefined;
      state.name = undefined;
      state.email = undefined;
      state.role = undefined;
      state.loading = false;
    }
  }
});

export const { setUser, clearUser } = authSlice.actions;
export default authSlice.reducer;
