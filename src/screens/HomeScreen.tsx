import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Button } from 'react-native';

export default function HomeScreen({ navigation }: any) {
  const [isSenderMode, setIsSenderMode] = useState(false);

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22 }}>MyAzan</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 20 }}>
        <Text>{isSenderMode ? 'Sender Mode' : 'Receiver Mode'}</Text>
        <Switch value={isSenderMode} onValueChange={setIsSenderMode} />
      </View>
      {isSenderMode ? (
        <Button title="Open Sender Dashboard" onPress={() => navigation.navigate('SenderDashboard')} />
      ) : (
        <Button title="Open Receiver Dashboard" onPress={() => navigation.navigate('ReceiverDashboard')} />
      )}
      <Button title="Settings" onPress={() => navigation.navigate('Settings')} />
    </View>
  );
}
