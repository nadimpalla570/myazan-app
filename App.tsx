import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { store } from './src/store';
import { RootState } from './src/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './src/services/firebase';
import { setUser, clearUser } from './src/store/slices/authSlice';
import { doc, getDoc } from 'firebase/firestore';

// Screens
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import SenderDashboard from './src/screens/SenderDashboard';
import ReceiverDashboard from './src/screens/ReceiverDashboard';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function AppNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="SenderDashboard" component={SenderDashboard} />
      <Stack.Screen name="ReceiverDashboard" component={ReceiverDashboard} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const dispatch = useDispatch();
  const { uid, loading } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: any) => {
      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          const userData = snap.exists() ? snap.data() : { uid: user.uid, name: user.email, role: 'receiver' };
          dispatch(setUser({ uid: user.uid, name: userData.name, email: user.email, role: userData.role }));
        } catch (error) {
          console.error('Error loading user data:', error);
          dispatch(setUser({ uid: user.uid, name: user.email, email: user.email, role: 'receiver' }));
        }
      } else {
        dispatch(clearUser());
      }
    });
    return () => unsubscribe();
  }, [dispatch]);

  if (loading) {
    return null; // Show splash screen here
  }

  return (
    <NavigationContainer>
      {uid ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <RootNavigator />
    </Provider>
  );
}
