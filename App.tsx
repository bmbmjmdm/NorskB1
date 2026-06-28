import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionScreen } from '@/screens/SessionScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { useAppConfig } from '@/hooks/useAppConfig';
import { loadState, saveState } from '@/services/storage';
import { parseBackup, serializeBackup } from '@/services/backup';
import { exportBackupFile, isCancel, pickBackupText } from '@/services/backupIO';
import { colors } from '@/theme';

// iOS tears down an RN <Modal> if a native picker/share sheet is presented over
// it, leaving a ghost layer that blocks all touches. So we always close the
// settings sheet first and wait for its dismissal animation before presenting
// any native sheet.
const MODAL_DISMISS_MS = 500;

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
  // Bumping this remounts SessionScreen so it reloads progress after an import.
  const [sessionEpoch, setSessionEpoch] = useState(0);

  const onExport = useCallback(() => {
    setShowSettings(false);
    setTimeout(async () => {
      try {
        const state = await loadState();
        const json = serializeBackup(state, {
          settings: app.settings,
          customCards: app.customCards,
        });
        await exportBackupFile(json);
      } catch (err) {
        if (!isCancel(err)) {
          Alert.alert('Export failed', (err as Error)?.message ?? 'Unknown error.');
        }
      }
    }, MODAL_DISMISS_MS);
  }, [app.settings, app.customCards]);

  const onImport = useCallback(() => {
    setShowSettings(false);
    setTimeout(async () => {
      try {
        const text = await pickBackupText();
        const { state, config } = parseBackup(text);
        await saveState(state);
        app.replaceConfig(config.settings, config.customCards);
        setSessionEpoch(e => e + 1); // reload the session from the imported data
        Alert.alert('Backup restored', 'Your progress and settings were imported.');
      } catch (err) {
        if (!isCancel(err)) {
          Alert.alert('Import failed', (err as Error)?.message ?? 'Unknown error.');
        }
      }
    }, MODAL_DISMISS_MS);
  }, [app]);

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
        key={sessionEpoch}
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
        onExport={onExport}
        onImport={onImport}
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
