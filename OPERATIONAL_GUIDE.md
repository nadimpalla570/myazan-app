# Operational Guide: MyAzan Backend & Frontend

## Table of Contents
1. [Firestore Listeners & Auto-Join](#firestore-listeners--auto-join)
2. [Channel Collision Prevention](#channel-collision-prevention)
3. [Token Refresh & Expiration](#token-refresh--expiration)
4. [Offline Handling](#offline-handling)
5. [Error Handling & Logging](#error-handling--logging)
6. [Monitoring & Analytics](#monitoring--analytics)
7. [Security Checklist](#security-checklist)
8. [Testing Strategy](#testing-strategy)
9. [Deployment & CI/CD](#deployment--cicd)
10. [Troubleshooting](#troubleshooting)

---

## Firestore Listeners & Auto-Join

### Overview
Receivers automatically listen to live announcements in Firestore. When a sender starts broadcasting, the receiver's app detects the change and auto-joins the Agora channel.

### Implementation
- **Service:** `src/services/firebaseListener.ts`
- **Flow:**
  1. Receiver starts app → calls `firebaseListenerService.startListening()`
  2. Listener queries `announcements` collection where `isLive == true`
  3. On new announcement, receiver checks if `senderId` is in their mappings
  4. If yes, triggers auto-join by calling `joinChannel()`
  5. On announcement end (`isLive: false`), listener triggers auto-disconnect

### Usage Example (Frontend)
```typescript
import { firebaseListenerService } from './services/firebaseListener';
import { joinChannel, leaveChannel } from './services/agora';

// In your receiver screen/component
useEffect(() => {
  firebaseListenerService.startListening(
    {
      onNewAnnouncement: async (announcement) => {
        console.log('Auto-joining:', announcement.channelName);
        await joinChannel(engine, announcement.channelName, userId, 'audience');
      },
      onAnnouncementEnded: async (sessionId, channelName) => {
        console.log('Auto-leaving:', channelName);
        await leaveChannel(engine);
      },
      onError: (error) => {
        console.error('Listener error:', error);
        // Show error UI to user
      },
    },
    'receiver',
    userId,
    userMappings?.senderIds // Array of sender UIDs this receiver listens to
  );

  return () => firebaseListenerService.stopListening();
}, [userId, userMappings]);
```

---

## Channel Collision Prevention

### Problem
Multiple senders could try to broadcast simultaneously, or a crashed sender could leave a stale session. This causes channel conflicts.

### Solution
- **Deterministic naming:** `myazan_<senderId>` ensures one channel per sender.
- **Collision check:** Before starting broadcast, `ChannelManager.checkActiveSession()` queries Firestore.
- **Atomicity:** Use Firestore transactions (optional) for production.
- **Cleanup:** Periodically call `ChannelManager.cleanupStaleSessions()` to close sessions older than 60 minutes.

### Usage Example (Frontend - Sender)
```typescript
import { ChannelManager } from './services/channelManager';

async function startBroadcast(senderId: string) {
  const channelName = ChannelManager.generateChannelName(senderId);

  // Check for active session
  const activeExists = await ChannelManager.checkActiveSession(channelName);
  if (activeExists) {
    Alert.alert('Error', 'A broadcast is already active for this channel. End it first.');
    return;
  }

  // Request token from backend
  const { token, expiresAt } = await generateAgoraToken(channelName, 0, 'publisher');

  // Start session in Firestore
  const sessionId = generateUUID();
  const success = await ChannelManager.startSession(
    sessionId,
    senderId,
    channelName,
    token,
    new Date(expiresAt)
  );

  if (!success) {
    Alert.alert('Error', 'Could not start broadcast. Try again later.');
    return;
  }

  // Join Agora channel
  await joinChannel(engine, channelName, 0, 'publisher');
}

async function endBroadcast(sessionId: string) {
  await ChannelManager.endSession(sessionId);
  await leaveChannel(engine);
}
```

---

## Token Refresh & Expiration

### Problem
Agora tokens expire (default TTL: 1 hour). Mid-session expiration causes disconnects.

### Solution
- Listen to `TokenPrivilegeWillExpire` event from Agora SDK.
- Request a new token from the backend.
- Call `engine.renewToken(newToken)` to refresh without disconnecting.

### Implementation
- **Service:** `src/utils/tokenRefresh.ts`
- **Flow:**
  1. Join channel with initial token
  2. Agora emits `TokenPrivilegeWillExpire` (typically 30 sec before expiry)
  3. `TokenRefreshManager` catches event, calls backend for new token
  4. Calls `renewToken()` to update token in Agora SDK

### Usage Example (Frontend)
```typescript
import { tokenRefreshManager } from './utils/tokenRefresh';

async function joinChannel(engine, channelName, uid, role) {
  const { token } = await generateAgoraToken(channelName, uid, role);
  
  // Initialize token refresh handler
  tokenRefreshManager.initialize(engine, channelName, uid, role);

  // Join channel
  await engine.joinChannel(token, channelName, null, uid);
}

// On disconnect
async function leaveChannel(engine) {
  tokenRefreshManager.cleanup();
  await engine.leaveChannel();
}
```

### Backend Tip
For testing, use short TTL (e.g., 5 minutes) in dev to validate refresh flows:
```typescript
// In backend token.controller.ts
const ttlSeconds = process.env.NODE_ENV === 'production' ? 3600 : 300; // 5 min in dev
```

---

## Offline Handling

### Receiver Offline
- **Problem:** Receiver loses network; can't receive live announcements.
- **Solution:**
  1. Catch network errors in `firebaseListenerService`.
  2. Cache last active channels locally (AsyncStorage).
  3. Show "Reconnecting..." UI.
  4. Attempt to re-subscribe when network returns.

### Sender Offline
- **Problem:** Sender's app crashes; session stays marked `isLive: true`.
- **Solution:**
  1. Cloud Function: Scheduled cleanup task runs hourly.
  2. Query announcements where `startedAt < now() - 60 minutes` and `isLive == true`.
  3. Mark those as `isLive: false`.

### Implementation Example (Frontend)
```typescript
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function handleNetworkReconnect() {
  const isConnected = await NetInfo.fetch().then(state => state.isConnected);
  
  if (isConnected && !firebaseListenerService.isActive()) {
    // Restore last cached state
    const cachedChannels = await AsyncStorage.getItem('activeChannels');
    if (cachedChannels) {
      // Re-join or re-subscribe to previous channels
      firebaseListenerService.startListening(callbacks);
    }
  }
}

// Listen for network changes
NetInfo.addEventListener(handleNetworkReconnect);
```

---

## Error Handling & Logging

### Recommended Libraries
- **Sentry:** Real-time crash/error tracking.
- **Firebase Crashlytics:** Built into Firebase SDK.

### Setup Sentry (Optional)
```bash
npm install @sentry/react-native
```

### Usage
```typescript
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://YOUR_SENTRY_KEY@sentry.io/PROJECT_ID',
  environment: 'production',
});

// Capture errors
try {
  await joinChannel(engine, channelName, uid, role);
} catch (error) {
  Sentry.captureException(error);
  console.error('Join channel failed:', error);
}
```

### Backend Logging
```typescript
// src/middleware/errorHandler.ts
import * as Sentry from '@sentry/node';

export const errorHandler = (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Sentry.captureException(err);
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
};

// In app.ts
app.use(errorHandler);
```

---

## Monitoring & Analytics

### Agora QoS Metrics
Track audio quality, network stats, and user join/leave times.

```typescript
// src/services/agora.ts
engine.addListener('RemoteAudioStats', (stats) => {
  console.log('Remote user audio stats:', stats);
  // Log to analytics: bitrate, packet loss, delay
  analytics.logAudioQuality({
    userId: stats.uid,
    bitrate: stats.receivedBitrate,
    packetLoss: stats.audioLossRate,
  });
});

engine.addListener('RtcStats', (stats) => {
  console.log('Connection stats:', stats);
  // Log: total duration, users joined, etc.
  analytics.logSessionStats({
    duration: stats.duration,
    usersJoined: stats.users,
    txBytes: stats.txBytes,
    rxBytes: stats.rxBytes,
  });
});
```

### Firestore Analytics
Log user actions (join, leave, broadcast start/end) to a separate collection for dashboards.

```typescript
// src/services/firestore.service.ts
async logUserAction(userId: string, action: string, metadata?: any) {
  await db.collection('analytics').add({
    userId,
    action,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata,
  });
}
```

---

## Security Checklist

### Backend
- [ ] Enforce HTTPS (use `Helmet` middleware)
- [ ] Validate all Firebase ID tokens in middleware
- [ ] Use strong CORS policies (whitelist origins)
- [ ] Apply rate limiting (express-rate-limit)
- [ ] Rotate Agora AppCertificate if leaked
- [ ] Use environment variables for secrets (.env)
- [ ] Validate input on all endpoints (sanitize, limit size)
- [ ] Log security events (failed auth, suspicious requests)

### Frontend
- [ ] Request microphone permissions at runtime
- [ ] Handle permission denial gracefully
- [ ] Store sensitive tokens securely (not localStorage if React Native)
- [ ] Use HTTPS for all API calls
- [ ] Validate Firebase auth state on app start

### Firestore
- [ ] Audit security rules regularly
- [ ] Deny delete on critical collections (e.g., users)
- [ ] Test rules with Firebase emulator before deploy
- [ ] Use custom claims for role-based access (admin, sender, receiver)
- [ ] Monitor Firestore usage for anomalies

---

## Testing Strategy

### Backend (Jest + Supertest)
```bash
npm test
```

- **Unit tests:** Token generation, Firestore queries
- **Integration tests:** API endpoints with mocked Firebase
- **Snapshot tests:** API response validation

### Frontend (Jest + React Native Testing Library)
```bash
npm test -- --testPathPattern=__tests__
```

- **Component tests:** Sender/Receiver dashboard UI
- **Service tests:** Firestore listeners, channel manager
- **E2E (optional):** Detox for full app flows

### Test Sample Structure
```
__tests__/
├── setup.ts                    # Mock setup
├── agora.token.test.ts         # Token generation
├── channelManager.test.ts      # Channel collision prevention
├── firebaseListener.test.ts    # Listener behavior
└── components/
    ├── SenderDashboard.test.tsx
    └── ReceiverDashboard.test.tsx
```

---

## Deployment & CI/CD

### GitHub Actions Example
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
        working-directory: ./myazan-backend
      - run: npm run build
        working-directory: ./myazan-backend
      - run: npm test
        working-directory: ./myazan-backend
  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          # Example: Deploy backend to Cloud Run, Firebase
          gcloud run deploy myazan-backend ...
```

### Firestore Rules Deployment
```bash
# Deploy security rules to Firebase
firebase deploy --only firestore:rules
```

---

## Troubleshooting

### Issue: "Receiver not auto-joining"
- [ ] Check Firestore listener is started (`firebaseListenerService.startListening()`)
- [ ] Verify sender is in receiver's mapping
- [ ] Check `isLive: true` in announcements doc
- [ ] Check network connectivity and Firebase auth
- [ ] Review console logs for listener errors

### Issue: "Token expiration mid-stream"
- [ ] Verify `TokenPrivilegeWillExpire` listener is registered
- [ ] Check backend is returning valid tokens
- [ ] Increase token TTL if development
- [ ] Inspect token expiry time in Agora dashboard

### Issue: "Channel collision / already in use"
- [ ] Check `ChannelManager.checkActiveSession()` is called before start
- [ ] Run `ChannelManager.cleanupStaleSessions()` to clear stale sessions
- [ ] Verify sender ended previous session (`isLive: false`)
- [ ] Check Firestore for multiple docs with same `channelName`

### Issue: "Offline receiver can't reconnect"
- [ ] Check network error handling in listener
- [ ] Verify cached state is restored on reconnect
- [ ] Test with poor network simulation (dev tools)
- [ ] Ensure Firestore rules allow re-subscribe after disconnect

### Performance Tuning
- **Firestore:** Index announcements by `isLive` and `senderId` for faster queries
- **Agora:** Monitor network stats; adjust audio bitrate dynamically
- **React Native:** Use `FlatList` with `removeClippedSubviews` for large lists

---

## Additional Resources
- [Agora Documentation](https://docs.agora.io/en/)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
- [React Native Agora SDK](https://github.com/AgoraIO-Community/react-native-agora)
- [Firebase Security Rules](https://firebase.google.com/docs/rules/basics)
