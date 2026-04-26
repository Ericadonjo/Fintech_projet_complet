import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Text } from 'react-native';

// Hack to set default global font in React Native
interface TextWithDefaultProps extends React.FunctionComponent<any> {
  defaultProps?: any;
}
((Text as unknown) as TextWithDefaultProps).defaultProps = ((Text as unknown) as TextWithDefaultProps).defaultProps || {};
((Text as unknown) as TextWithDefaultProps).defaultProps.style = { fontFamily: 'PlusJakartaSans-Medium' };

import LoginScreen from './src/screens/LoginScreen';
import AppNavigator from './src/navigation/AppNavigator';
import { Colors } from './src/theme';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  const [fontsLoaded] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    'DMSerifDisplay-Regular': DMSerifDisplay_400Regular,
  });

  useEffect(() => {
    AsyncStorage.getItem('pme_user').then(val => {
      setIsLoggedIn(!!val);
    });
  }, []);

  if (isLoggedIn === null || !fontsLoaded) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.g800 }}>
          <ActivityIndicator color={Colors.a400} size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isLoggedIn ? 'dark' : 'light'} backgroundColor="transparent" translucent />
      {isLoggedIn
        ? <AppNavigator onLogout={() => setIsLoggedIn(false)} />
        : <LoginScreen onLogin={() => setIsLoggedIn(true)} />
      }
    </SafeAreaProvider>
  );
}
