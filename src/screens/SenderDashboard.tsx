import React, { useState, useEffect, useRef } from 'react';
import { View, Button, Text, FlatList, TouchableOpacity } from 'react-native';
import { collection, getDocs, setDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { createAgoraEngine, joinChannel, leaveChannel } from '../services/agora';
import RtcEngine from 'react-native-agora';

export default function SenderDashboard() {
  const [users, setUsers] = useState<any[]>([]);
  const [mapping, setMapping] = useState<string[]>([]);
  const [isLive, setIsLive] = useState(false);
  const engineRef = useRef<any | null>(null);
  const myUid = 'SENDER_UID_PLACEHOLDER'; // replace with real current uid from auth

  useEffect(() => {
    // load users for add/remove
    (async () => {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map((d: any) => d.data()));
    })();
  }, []);

  const toggleReceiver = (receiverUid: string) => {
    setMapping(prev => {
      if (prev.includes(receiverUid)) return prev.filter(id => id !== receiverUid);
      return [...prev, receiverUid];
    });
  };

  const persistMapping = async () => {
    const mappingDoc = doc(db, 'mappings', myUid);
    await setDoc(mappingDoc, {
      senderId: myUid,
      receivers: mapping,
      createdAt: serverTimestamp(),
      active: true
    });
    alert('Mapping saved.');
  };

  const startBroadcast = async () => {
    engineRef.current = await createAgoraEngine();
    const channelName = `myazan_${myUid}`;
    await joinChannel(engineRef.current!, channelName, 0, 'publisher');
    // create announcement doc in Firestore
    const sessionDocId = `${myUid}_${Date.now()}`;
    await setDoc(doc(db, 'announcements', sessionDocId), {
      sessionId: sessionDocId,
      senderId: myUid,
      channelName,
      agoraToken: 'server-generated', // optionally store token if you want
      startedAt: serverTimestamp(),
      isLive: true
    });
    setIsLive(true);
  };

  const stopBroadcast = async () => {
    if (engineRef.current) {
      await leaveChannel(engineRef.current);
      engineRef.current = null;
    }
    // update announcements: mark isLive=false
    setIsLive(false);
    // update Firestore active session cleanup to set isLive false (client could write)
  };

  return (
    <View style={{ flex: 1, padding: 10 }}>
      <Text style={{ fontSize: 18 }}>Sender Dashboard</Text>
      <Button title="Save mapping" onPress={persistMapping} />
      <FlatList
        data={users}
        keyExtractor={(i) => i.uid}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => toggleReceiver(item.uid)} style={{ padding: 8 }}>
            <Text>{item.name} {mapping.includes(item.uid) ? '(added)' : ''}</Text>
          </TouchableOpacity>
        )}
      />
      <View style={{ marginTop: 20 }}>
        <Button title={isLive ? 'Stop Broadcast' : 'Start Broadcast'} onPress={isLive ? stopBroadcast : startBroadcast} />
      </View>
    </View>
  );
}
