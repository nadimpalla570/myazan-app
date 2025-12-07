import React, { useState } from 'react';
import { View, TextInput, Button, Text } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { useDispatch } from 'react-redux';
import { setUser } from '../../store/slices/authSlice';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch();

  const login = async () => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;
      // Load profile from Firestore
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.exists() ? snap.data() : { uid, name: credential.user.email, role: 'receiver' };
      dispatch(setUser({ uid: data.uid, name: data.name, email: credential.user.email, role: data.role }));
      navigation.replace('Home');
    } catch (err:any) {
      alert(err.message);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>Login</Text>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Button title="Login" onPress={login} />
      <Text onPress={() => navigation.navigate('Register')} style={{ color: 'blue', marginTop: 10 }}>Create account</Text>
    </View>
  );
}
