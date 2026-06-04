import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionScreen } from '@/screens/SessionScreen';
import { colors } from '@/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <SessionScreen />
    </SafeAreaProvider>
  );
}
