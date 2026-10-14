// Firebase Console > Project settings > Your apps > Web app > SDK config
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// SHA-256 of the admin PIN. Generate a new one with: echo -n "YENIPIN" | shasum -a 256
export const ADMIN_PIN_SHA256 = 'e04b94bc203ba9a100dd6561b6dc95c64d8eaddb4c6bd334f008ea233a139324';
