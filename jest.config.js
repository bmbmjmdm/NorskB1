module.exports = {
  preset: '@react-native/jest-preset',
  // Registers an in-memory AsyncStorage mock so components that persist state render in tests.
  setupFiles: ['./jest.setup.js'],
};
