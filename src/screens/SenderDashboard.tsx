import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
  FlatList,
  Switch,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RtcEngine, ChannelProfile, ClientRole } from 'react-native-agora';

import { setCurrentChannel, setLive } from '../store/slices/sessionSlice';
import * as api from '../services/api';
import { ChannelManager } from '../services/channelManager';
import { TokenRefreshManager } from '../utils/tokenRefresh';

interface BroadcastState {
  sessionId: string | null;
  channelName: string | null;
  isLive: boolean;
  isLoading: boolean;
  error: string | null;
  participantCount: number;
  duration: number; // seconds
}

interface ReceiverMapping {
  uid: string;
  name: string;
  email: string;
  role: string;
  selected: boolean;
}

export default function SenderDashboard() {
  const dispatch = useDispatch();
  const auth = useSelector((state: any) => state.auth);
  const session = useSelector((state: any) => state.session);

  const [broadcastState, setBroadcastState] = useState<BroadcastState>({
    sessionId: null,
    channelName: null,
    isLive: false,
    isLoading: false,
    error: null,
    participantCount: 0,
    duration: 0,
  });

  const [receivers, setReceivers] = useState<ReceiverMapping[]>([]);
  const [showReceiverList, setShowReceiverList] = useState(false);

  const engineRef = useRef<any>(null);
  const tokenRefreshRef = useRef<TokenRefreshManager | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Agora engine
  useEffect(() => {
    initializeAgoraEngine();
    return () => {
      cleanupAgoraEngine();
    };
  }, []);

  // Load all users and current mappings
  useEffect(() => {
    loadReceiversList();
  }, [auth.user?.uid]);

  // Duration timer
  useEffect(() => {
    if (broadcastState.isLive) {
      durationIntervalRef.current = setInterval(() => {
        setBroadcastState((prev) => ({
          ...prev,
          duration: prev.duration + 1,
        }));
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [broadcastState.isLive]);

  async function initializeAgoraEngine() {
    try {
      const engine = await RtcEngine.create(
        process.env.REACT_APP_AGORA_APP_ID || ''
      );

      await engine.enableAudio();
      await engine.setChannelProfile(ChannelProfile.Communication);
      await engine.setClientRole(ClientRole.Broadcaster);

      // Add event listeners
      engine.addListener('UserJoined', (uid: number) => {
        console.log(`User ${uid} joined`);
        setBroadcastState((prev) => ({
          ...prev,
          participantCount: prev.participantCount + 1,
        }));
      });

      engine.addListener('UserOffline', (uid: number) => {
        console.log(`User ${uid} left`);
        setBroadcastState((prev) => ({
          ...prev,
          participantCount: Math.max(0, prev.participantCount - 1),
        }));
      });

      engine.addListener('Error', (err: any) => {
        console.error('Agora error:', err);
        setBroadcastState((prev) => ({
          ...prev,
          error: `Audio error: ${JSON.stringify(err)}`,
        }));
      });

      engineRef.current = engine;
      console.log('Agora engine initialized');
    } catch (error) {
      console.error('Failed to initialize Agora:', error);
      setBroadcastState((prev) => ({
        ...prev,
        error: 'Failed to initialize audio engine',
      }));
    }
  }

  async function loadReceiversList() {
    try {
      const users = await api.getAllUsers();

      // Filter out self and get mapping
      const currentMapping = await api.getMapping(auth.user.uid).catch(() => null);
      const currentReceiverIds = currentMapping?.receivers || [];

      const receiverList: ReceiverMapping[] = users
        .filter((u: any) => u.uid !== auth.user.uid)
        .map((u: any) => ({
          uid: u.uid,
          name: u.name,
          email: u.email,
          role: u.role,
          selected: currentReceiverIds.includes(u.uid),
        }));

      setReceivers(receiverList);
    } catch (error) {
      console.error('Error loading receivers:', error);
      setBroadcastState((prev) => ({
        ...prev,
        error: 'Failed to load receiver list',
      }));
    }
  }

  async function toggleReceiverSelection(receiverId: string) {
    try {
      const receiver = receivers.find((r) => r.uid === receiverId);
      if (!receiver) return;

      if (receiver.selected) {
        // Remove from mapping
        await api.removeReceiverFromMapping(auth.user.uid, receiverId);
      } else {
        // Add to mapping
        await api.addReceiverToMapping(auth.user.uid, receiverId);
      }

      // Update local state
      setReceivers((prev) =>
        prev.map((r) =>
          r.uid === receiverId ? { ...r, selected: !r.selected } : r
        )
      );
    } catch (error) {
      console.error('Error updating receiver:', error);
      Alert.alert('Error', 'Failed to update receiver');
    }
  }

  async function startBroadcast() {
    if (!engineRef.current || !auth.user) {
      Alert.alert('Error', 'Not ready to broadcast');
      return;
    }

    setBroadcastState((prev) => ({ ...prev, isLoading: true }));

    try {
      const sessionId = `${auth.user.uid}_${Date.now()}`;
      const channelName = ChannelManager.generateChannelName(auth.user.uid);

      // Check collision
      const activeExists = await ChannelManager.checkActiveSession(channelName);
      if (activeExists) {
        setBroadcastState((prev) => ({
          ...prev,
          error: 'A broadcast is already active. End it first.',
          isLoading: false,
        }));
        return;
      }

      // Get Agora token
      const { token, expiresAt } = await api.generateAgoraToken(
        channelName,
        0,
        'publisher'
      );

      // Create announcement
      await api.createAnnouncement(
        sessionId,
        channelName,
        token,
        expiresAt
      );

      // Join channel
      await engineRef.current.joinChannel(token, channelName, null, 0);

      // Setup token refresh
      tokenRefreshRef.current = new TokenRefreshManager();
      tokenRefreshRef.current.initialize(
        engineRef.current,
        channelName,
        0,
        'publisher'
      );

      // Update state
      setBroadcastState((prev) => ({
        ...prev,
        sessionId,
        channelName,
        isLive: true,
        isLoading: false,
        error: null,
        duration: 0,
        participantCount: 0,
      }));

      dispatch(setCurrentChannel(channelName));
      dispatch(setLive(true));

      Alert.alert('Success', 'Broadcast started!');
    } catch (error: any) {
      console.error('Error starting broadcast:', error);
      setBroadcastState((prev) => ({
        ...prev,
        error: `Failed: ${error.message}`,
        isLoading: false,
      }));
    }
  }

  async function endBroadcast() {
    if (!engineRef.current || !broadcastState.sessionId) {
      return;
    }

    setBroadcastState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Update announcement
      await api.endAnnouncement(broadcastState.sessionId);

      // Leave channel
      await engineRef.current.leaveChannel();

      // Cleanup token refresh
      tokenRefreshRef.current?.cleanup();

      // Update state
      setBroadcastState((prev) => ({
        ...prev,
        sessionId: null,
        channelName: null,
        isLive: false,
        isLoading: false,
        duration: 0,
        participantCount: 0,
      }));

      dispatch(setCurrentChannel(null));
      dispatch(setLive(false));

      Alert.alert('Success', 'Broadcast ended');
    } catch (error: any) {
      console.error('Error ending broadcast:', error);
      setBroadcastState((prev) => ({
        ...prev,
        error: `Failed: ${error.message}`,
        isLoading: false,
      }));
    }
  }

  async function cleanupAgoraEngine() {
    if (broadcastState.isLive) {
      await endBroadcast();
    }
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
    <ScrollView style={styles.container}>
      <Text style={styles.title}>📻 Sender Dashboard</Text>

      {/* Error Message */}
      {broadcastState.error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{broadcastState.error}</Text>
        </View>
      )}

      {/* Live Broadcast Status */}
      {broadcastState.isLive ? (
        <>
          <View style={styles.statusBox}>
            <Text style={styles.statusTitle}>🔴 LIVE</Text>
            <Text style={styles.channelName}>{broadcastState.channelName}</Text>
            <Text style={styles.duration}>
              Duration: {formatDuration(broadcastState.duration)}
            </Text>
            <Text style={styles.listeners}>
              Listeners: {broadcastState.participantCount}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={endBroadcast}
            disabled={broadcastState.isLoading}
          >
            {broadcastState.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>⏹️ Stop Broadcast</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Select Recipients</Text>
          <TouchableOpacity
            style={styles.toggleButton}
            onPress={() => setShowReceiverList(!showReceiverList)}
          >
            <Text style={styles.toggleButtonText}>
              {showReceiverList ? '▼' : '▶'} Show Recipients (
              {receivers.filter((r) => r.selected).length})
            </Text>
          </TouchableOpacity>

          {showReceiverList && (
            <View style={styles.receiverList}>
              {receivers.length === 0 ? (
                <Text style={styles.emptyText}>No users available</Text>
              ) : (
                <FlatList
                  data={receivers}
                  keyExtractor={(item) => item.uid}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <View style={styles.receiverItem}>
                      <View style={styles.receiverInfo}>
                        <Text style={styles.receiverName}>{item.name}</Text>
                        <Text style={styles.receiverEmail}>{item.email}</Text>
                      </View>
                      <Switch
                        value={item.selected}
                        onValueChange={() =>
                          toggleReceiverSelection(item.uid)
                        }
                        trackColor={{ false: '#d3d3d3', true: '#81c784' }}
                        thumbColor={item.selected ? '#4CAF50' : '#f4f3f4'}
                      />
                    </View>
                  )}
                />
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, styles.startButton]}
            onPress={startBroadcast}
            disabled={broadcastState.isLoading}
          >
            {broadcastState.isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>🎤 Start Broadcast</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>ℹ️ How it works:</Text>
        <Text style={styles.infoText}>
          1. Select receivers from the list{'\n'}
          2. Press "Start Broadcast"{'\n'}
          3. Selected users will auto-join{'\n'}
          4. Press "Stop Broadcast" to end
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 12,
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
  statusBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ff5252',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#ff5252',
  },
  channelName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
  },
  duration: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  listeners: {
    fontSize: 16,
    color: '#666',
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
    flexDirection: 'row',
    gap: 8,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    marginTop: 20,
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleButton: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
  },
  receiverList: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 20,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  receiverItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  receiverInfo: {
    flex: 1,
  },
  receiverName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  receiverEmail: {
    fontSize: 13,
    color: '#999',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    padding: 16,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 40,
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
