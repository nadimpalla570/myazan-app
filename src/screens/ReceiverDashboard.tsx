import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSelector } from 'react-redux';
import { RtcEngine, ChannelProfile, ClientRole } from 'react-native-agora';

import { FirebaseListenerService } from '../services/firebaseListener';
import { TokenRefreshManager } from '../utils/tokenRefresh';
import * as api from '../services/api';

interface ActiveAnnouncement {
  sessionId: string;
  channelName: string;
  senderId: string;
  senderName: string;
  isJoined: boolean;
  duration: number;
}

export default function ReceiverDashboard() {
  const auth = useSelector((state: any) => state.auth);

  const [activeAnnouncements, setActiveAnnouncements] = useState<
    ActiveAnnouncement[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<any>(null);
  const listenerServiceRef = useRef<FirebaseListenerService | null>(null);
  const tokenRefreshRefs = useRef<Map<string, TokenRefreshManager>>(new Map());
  const durationIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Initialize Agora engine
  useEffect(() => {
    initializeAgoraEngine();
    return () => {
      cleanupAgoraEngine();
    };
  }, []);

  // Setup Firestore listeners
  useEffect(() => {
    if (!engineRef.current || !auth.user) {
      return;
    }

    setupFirestoreListeners();
    return () => {
      listenerServiceRef.current?.stopListening();
    };
  }, [engineRef.current, auth.user?.uid]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup all timers
      durationIntervalsRef.current.forEach((interval) =>
        clearInterval(interval)
      );
      durationIntervalsRef.current.clear();

      // Cleanup all token refresh managers
      tokenRefreshRefs.current.forEach((manager) => manager.cleanup());
      tokenRefreshRefs.current.clear();
    };
  }, []);

  async function initializeAgoraEngine() {
    try {
      const engine = await RtcEngine.create(
        process.env.REACT_APP_AGORA_APP_ID || ''
      );

      await engine.enableAudio();
      await engine.setChannelProfile(ChannelProfile.Communication);
      await engine.setClientRole(ClientRole.Audience);

      // Add event listeners
      engine.addListener('UserJoined', (uid: number) => {
        console.log(`Speaker ${uid} joined`);
      });

      engine.addListener('UserOffline', (uid: number) => {
        console.log(`Speaker ${uid} left`);
      });

      engine.addListener('Error', (err: any) => {
        console.error('Agora error:', err);
        setError(`Audio error: ${JSON.stringify(err)}`);
      });

      engineRef.current = engine;
      console.log('Agora engine initialized');
    } catch (error) {
      console.error('Failed to initialize Agora:', error);
      setError('Failed to initialize audio engine');
    }
  }

  async function setupFirestoreListeners() {
    try {
      const sendersMapping = await api
        .getMapping(auth.user.uid)
        .catch(() => null);
      const receivesFromSenderIds = sendersMapping?.receivers || [];

      listenerServiceRef.current = new FirebaseListenerService();
      listenerServiceRef.current.startListening(
        {
          onNewAnnouncement: (announcement) => {
            handleNewAnnouncement(announcement);
          },
          onAnnouncementEnded: (sessionId, channelName) => {
            handleAnnouncementEnded(sessionId, channelName);
          },
          onError: (error) => {
            console.error('Listener error:', error);
            setError('Listener error occurred');
          },
        },
        'receiver',
        auth.user.uid,
        receivesFromSenderIds
      );
    } catch (error) {
      console.error('Error setting up listeners:', error);
      setError('Failed to setup listeners');
    }
  }

  async function handleNewAnnouncement(announcement: any) {
    try {
      console.log('New announcement detected:', announcement);

      // Get sender name
      const sender = await api.getUser(announcement.senderId);
      const senderName = sender?.name || announcement.senderId;

      const newAnnouncement: ActiveAnnouncement = {
        sessionId: announcement.sessionId,
        channelName: announcement.channelName,
        senderId: announcement.senderId,
        senderName,
        isJoined: false,
        duration: 0,
      };

      setActiveAnnouncements((prev) => [...prev, newAnnouncement]);

      // Auto-join immediately
      await joinAnnouncement(announcement, senderName);
    } catch (error) {
      console.error('Error handling new announcement:', error);
    }
  }

  async function joinAnnouncement(announcement: any, senderName: string) {
    if (!engineRef.current) {
      console.error('Engine not ready');
      return;
    }

    try {
      setIsLoading(true);

      // Generate token as audience
      const { token } = await api.generateAgoraToken(
        announcement.channelName,
        auth.user.uid,
        'audience'
      );

      // Join channel
      await engineRef.current.joinChannel(
        token,
        announcement.channelName,
        null,
        auth.user.uid
      );

      // Setup token refresh
      const tokenRefreshManager = new TokenRefreshManager();
      tokenRefreshManager.initialize(
        engineRef.current,
        announcement.channelName,
        auth.user.uid,
        'audience'
      );
      tokenRefreshRefs.current.set(announcement.sessionId, tokenRefreshManager);

      // Start duration timer
      const durationInterval = setInterval(() => {
        setActiveAnnouncements((prev) =>
          prev.map((a) =>
            a.sessionId === announcement.sessionId
              ? { ...a, duration: a.duration + 1 }
              : a
          )
        );
      }, 1000);
      durationIntervalsRef.current.set(
        announcement.sessionId,
        durationInterval
      );

      // Update state
      setActiveAnnouncements((prev) =>
        prev.map((a) =>
          a.sessionId === announcement.sessionId
            ? { ...a, isJoined: true }
            : a
        )
      );

      console.log(
        `Auto-joined: ${announcement.channelName} (${senderName})`
      );
      setIsLoading(false);
    } catch (error: any) {
      console.error('Error joining announcement:', error);
      setError(`Failed to join: ${error.message}`);
      setIsLoading(false);
    }
  }

  async function handleAnnouncementEnded(sessionId: string, channelName: string) {
    try {
      console.log('Announcement ended:', channelName);

      // Leave channel
      if (engineRef.current) {
        await engineRef.current.leaveChannel();
      }

      // Cleanup token refresh
      const tokenRefresh = tokenRefreshRefs.current.get(sessionId);
      tokenRefresh?.cleanup();
      tokenRefreshRefs.current.delete(sessionId);

      // Cleanup duration timer
      const interval = durationIntervalsRef.current.get(sessionId);
      if (interval) {
        clearInterval(interval);
        durationIntervalsRef.current.delete(sessionId);
      }

      // Remove from active announcements
      setActiveAnnouncements((prev) =>
        prev.filter((a) => a.sessionId !== sessionId)
      );
    } catch (error) {
      console.error('Error handling announcement end:', error);
    }
  }

  async function leaveAnnouncement(sessionId: string) {
    try {
      if (!engineRef.current) return;

      await engineRef.current.leaveChannel();

      // Cleanup
      const tokenRefresh = tokenRefreshRefs.current.get(sessionId);
      tokenRefresh?.cleanup();
      tokenRefreshRefs.current.delete(sessionId);

      const interval = durationIntervalsRef.current.get(sessionId);
      if (interval) {
        clearInterval(interval);
        durationIntervalsRef.current.delete(sessionId);
      }

      setActiveAnnouncements((prev) =>
        prev.filter((a) => a.sessionId !== sessionId)
      );
    } catch (error) {
      console.error('Error leaving announcement:', error);
      Alert.alert('Error', 'Failed to leave broadcast');
    }
  }

  async function cleanupAgoraEngine() {
    // Leave all channels
    durationIntervalsRef.current.forEach((interval) =>
      clearInterval(interval)
    );
    tokenRefreshRefs.current.forEach((manager) => manager.cleanup());

    if (engineRef.current) {
      await engineRef.current.destroy();
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎧 Receiver Dashboard</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {activeAnnouncements.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {isLoading ? 'Connecting...' : 'No active broadcasts'}
          </Text>
          <Text style={styles.emptySubtext}>
            Waiting for senders to broadcast...
          </Text>
        </View>
      ) : (
        <FlatList
          data={activeAnnouncements}
          keyExtractor={(item) => item.sessionId}
          renderItem={({ item }) => (
            <View
              style={[
                styles.announcementCard,
                item.isJoined && styles.announcementCardActive,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.senderName}>🎤 {item.senderName}</Text>
                {item.isJoined && (
                  <Text style={styles.listeningBadge}>✓ Listening</Text>
                )}
              </View>

              <Text style={styles.channelName}>{item.channelName}</Text>

              <View style={styles.cardFooter}>
                <Text style={styles.duration}>
                  ⏱ {formatDuration(item.duration)}
                </Text>

                {item.isJoined ? (
                  <TouchableOpacity
                    style={styles.leaveButton}
                    onPress={() => leaveAnnouncement(item.sessionId)}
                  >
                    <Text style={styles.leaveButtonText}>Leave</Text>
                  </TouchableOpacity>
                ) : (
                  <ActivityIndicator
                    size="small"
                    color="#2196F3"
                  />
                )}
              </View>
            </View>
          )}
          scrollEnabled={true}
          style={styles.list}
        />
      )}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ How it works:</Text>
        <Text style={styles.infoText}>
          • Auto-joins broadcasts from senders you follow{'\n'}
          • Real-time audio streaming{'\n'}
          • Leave anytime by tapping the button
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  list: {
    flex: 1,
    marginBottom: 20,
  },
  announcementCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  announcementCardActive: {
    borderLeftColor: '#4CAF50',
    backgroundColor: '#f1f8f5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  senderName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  listeningBadge: {
    backgroundColor: '#4CAF50',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  channelName: {
    fontSize: 14,
    color: '#666',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duration: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  leaveButton: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
  },
});
