/**
 * Jest Setup File
 * Mock all external dependencies for testing
 */

// Mock Firebase Firestore (Frontend)
jest.mock('firebase/firestore', () => ({
  initializeApp: jest.fn(),
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(() => ({
    update: jest.fn(),
    commit: jest.fn(),
  })),
  serverTimestamp: jest.fn(() => new Date()),
  onSnapshot: jest.fn(),
}));

// Mock Firebase Auth (Frontend)
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
}));

// Mock React Native Agora
jest.mock('react-native-agora', () => ({
  create: jest.fn(),
  enableAudio: jest.fn(),
  setChannelProfile: jest.fn(),
  setClientRole: jest.fn(),
  joinChannel: jest.fn(),
  leaveChannel: jest.fn(),
  startPreview: jest.fn(),
  stopPreview: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  renewToken: jest.fn(),
}));

// Mock Axios
jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));
