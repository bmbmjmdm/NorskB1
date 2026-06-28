// Replace the AsyncStorage native module with an in-memory mock for tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Backup IO native modules — mocked (virtual so tests run even before install).
jest.mock(
  '@dr.pogodin/react-native-fs',
  () => ({
    // named exports (this package has no default export)
    TemporaryDirectoryPath: '/tmp',
    writeFile: jest.fn(() => Promise.resolve()),
    readFile: jest.fn(() => Promise.resolve('{}')),
  }),
  { virtual: true },
);
jest.mock(
  'react-native-share',
  () => ({ __esModule: true, default: { open: jest.fn(() => Promise.resolve()) } }),
  { virtual: true },
);
jest.mock(
  '@react-native-documents/picker',
  () => ({
    pick: jest.fn(() => Promise.resolve([])),
    keepLocalCopy: jest.fn(() => Promise.resolve([])),
    types: { json: 'json', plainText: 'plainText', allFiles: 'allFiles' },
    isErrorWithCode: () => false,
    errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  }),
  { virtual: true },
);
