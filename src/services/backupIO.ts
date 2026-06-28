/**
 * Native file IO for backup export/import. Isolated here so the rest of the app
 * (and the unit tests) don't depend on the native modules.
 *
 * Requires three native dependencies (install + `pod install` + rebuild):
 *   - @dr.pogodin/react-native-fs   (read/write files)
 *   - react-native-share            (system share sheet for export)
 *   - @react-native-documents/picker (file picker for import)
 */
// @dr.pogodin/react-native-fs exposes named exports (no default), so importing
// a default here yields `undefined` (the cause of "TemporaryDirectoryPath of
// undefined"). Import the pieces by name instead.
import {
  TemporaryDirectoryPath,
  readFile,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import Share from 'react-native-share';
import {
  pick,
  keepLocalCopy,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';

const EXPORT_FILENAME = 'norskb1-backup.json';

/** Write the backup JSON to a temp file and open the system share sheet. */
export async function exportBackupFile(json: string): Promise<void> {
  const path = `${TemporaryDirectoryPath}/${EXPORT_FILENAME}`;
  await writeFile(path, json, 'utf8');
  await Share.open({
    url: `file://${path}`,
    type: 'application/json',
    filename: 'norskb1-backup',
    failOnCancel: false,
  });
}

/** True when the error means the user cancelled the picker/share (not a failure). */
export function isCancel(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (isErrorWithCode(err) && e.code === errorCodes.OPERATION_CANCELED) {
    return true;
  }
  return /cancel/i.test(e.message ?? '');
}

/**
 * Let the user pick a backup file and return its text contents. Throws on
 * cancel (use `isCancel` to detect) or if the file can't be read.
 */
export async function pickBackupText(): Promise<string> {
  const [file] = await pick({
    type: [types.json, types.plainText, types.allFiles],
  });
  if (!file?.uri) {
    throw new Error('No file was selected.');
  }
  // Copy into app-accessible storage, then read it (picker URIs aren't always
  // directly readable, especially on Android content:// URIs).
  const [copy] = await keepLocalCopy({
    files: [{ uri: file.uri, fileName: file.name ?? EXPORT_FILENAME }],
    destination: 'cachesDirectory',
  });
  if (!copy || copy.status !== 'success') {
    throw new Error('Could not read the selected file.');
  }
  const localPath = copy.localUri.replace(/^file:\/\//, '');
  return readFile(localPath, 'utf8');
}
