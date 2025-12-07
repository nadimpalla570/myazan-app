import React from 'react';
import { View, Text, Button } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useDispatch } from 'react-redux';
import { clearUser } from '../store/slices/authSlice';

export default function SettingsScreen({ navigation }: any) {
  const dispatch = useDispatch();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      dispatch(clearUser());
      navigation.replace('Login');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 22, marginBottom: 20 }}>Settings</Text>
      <Button title="Logout" onPress={handleLogout} color="red" />
    </View>
  );
}
