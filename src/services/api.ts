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

// ==================== USER ENDPOINTS ====================

export async function createUser(name: string, email: string, role: 'sender' | 'receiver') {
  const idToken = await getFirebaseIdToken();
  const res = await axios.post(
    `${BACKEND_BASE}/user`,
    { name, email, role },
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function getUser(uid: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.get(
    `${BACKEND_BASE}/user/${uid}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function updateUser(uid: string, name?: string, role?: 'sender' | 'receiver') {
  const idToken = await getFirebaseIdToken();
  const res = await axios.put(
    `${BACKEND_BASE}/user/${uid}`,
    { ...(name && { name }), ...(role && { role }) },
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function getAllUsers() {
  const idToken = await getFirebaseIdToken();
  const res = await axios.get(
    `${BACKEND_BASE}/user`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

// ==================== MAPPINGS ENDPOINTS ====================

export async function getMapping(senderId: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.get(
    `${BACKEND_BASE}/mappings/${senderId}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function addReceiverToMapping(senderId: string, receiverId: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.post(
    `${BACKEND_BASE}/mappings/${senderId}/receivers/${receiverId}`,
    {},
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function removeReceiverFromMapping(senderId: string, receiverId: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.delete(
    `${BACKEND_BASE}/mappings/${senderId}/receivers/${receiverId}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

// ==================== ANNOUNCEMENTS ENDPOINTS ====================

export async function getAnnouncement(sessionId: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.get(
    `${BACKEND_BASE}/announcements/${sessionId}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function createAnnouncement(sessionId: string, channelName: string, agoraToken: string, expiresAt?: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.post(
    `${BACKEND_BASE}/announcements`,
    { sessionId, channelName, agoraToken, expiresAt },
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function updateAnnouncement(sessionId: string, isLive: boolean) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.put(
    `${BACKEND_BASE}/announcements/${sessionId}`,
    { isLive },
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function endAnnouncement(sessionId: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.delete(
    `${BACKEND_BASE}/announcements/${sessionId}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function getLiveAnnouncements() {
  const idToken = await getFirebaseIdToken();
  const res = await axios.get(
    `${BACKEND_BASE}/announcements/live`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}

export async function getAnnouncementsBySender(senderId: string) {
  const idToken = await getFirebaseIdToken();
  const res = await axios.get(
    `${BACKEND_BASE}/announcements/sender/${senderId}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  );
  return res.data;
}
