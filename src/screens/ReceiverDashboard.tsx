import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { createAgoraEngine, joinChannel, leaveChannel } from '../services/agora';
import RtcEngine from 'react-native-agora';

export default function ReceiverDashboard() {
  const [status, setStatus] = useState<'disconnected'|'listening'|'error'>('disconnected');
  const engineRef = useRef<any | null>(null);
  const myUid = 'RECEIVER_UID_PLACEHOLDER'; // replace with auth.uid

  useEffect(() => {
    // listen to mapping for all senders where receiver is in list (or more efficiently: maintain reverse mapping)
    const unsubscribe = onSnapshot(doc(db, 'mappings', 'SENDER_UID_PLACEHOLDER'), async (snap: any) => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.active && data.receivers && data.receivers.includes(myUid)) {
        // check for active announcements by sender
        // simple approach: query last announcement by sender and check isLive
        // Here we show an on-demand join; implement a Firestore listener on /announcements
      }
    });
    return () => unsubscribe();
  }, []);

  const connectToChannel = async (channelName: string) => {
    try {
      engineRef.current = await createAgoraEngine();
      await joinChannel(engineRef.current!, channelName, 0, 'audience', (uid: any) => {
        console.log('remote joined', uid);
      }, (uid: any) => {
        console.log('remote left', uid);
      });
      setStatus('listening');
    } catch (err) {
      console.warn(err);
      setStatus('error');
    }
  };

  const disconnect = async () => {
    if (engineRef.current) {
      await leaveChannel(engineRef.current);
      engineRef.current = null;
      setStatus('disconnected');
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text>Receiver Dashboard</Text>
      <Text>Status: {status}</Text>
      <Button title="Connect (test channel)" onPress={() => connectToChannel('myazan_TEST')} />
      <Button title="Disconnect" onPress={disconnect} />
    </View>
  );
}
