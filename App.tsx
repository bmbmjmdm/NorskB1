import React, { useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionScreen } from '@/screens/SessionScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAppConfig } from '@/hooks/useAppConfig';
import { colors } from '@/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <AppRoot />
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const app = useAppConfig();
  const [showSettings, setShowSettings] = useState(false);

  if (!app.loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <SessionScreen
        entries={app.entries}
        settings={app.settings}
        onOpenSettings={() => setShowSettings(true)}
      />
      <SettingsScreen
        visible={showSettings}
        settings={app.settings}
        onClose={() => setShowSettings(false)}
        onSave={app.updateSettings}
        onReset={app.resetSettings}
        onAddCard={app.addCard}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
