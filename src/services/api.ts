import axios from 'axios';
import { getAuth } from 'firebase/auth';

// Use environment variable or fallback to localhost for development
const BACKEND_BASE = process.env.REACT_APP_BACKEND_URL || 'http://localhost:4000/api';

export async function getFirebaseIdToken() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

export async function generateAgoraToken(channelName: string, uid = 0, role: 'publisher'|'audience' = 'audience') {
  const idToken = await getFirebaseIdToken();
  const res = await axios.post(
    `${BACKEND_BASE}/token/generate`,
    { channelName, uid, role },
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}
