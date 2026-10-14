import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig } from './config.js';

export const isConfigured = Boolean(firebaseConfig.projectId);

const app = isConfigured ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;
const BATCH_LIMIT = 400;

export const onAuth = (cb) => onAuthStateChanged(auth, cb);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider()).then((r) => r.user);
export const signOut = () => fbSignOut(auth);

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

export function subscribe({ onTeams, onMatches, onSettings, onError }) {
  onSnapshot(collection(db, 'teams'), (s) => onTeams(withId(s)), onError);
  onSnapshot(collection(db, 'matches'), (s) => onMatches(withId(s)), onError);
  onSnapshot(doc(db, 'meta', 'settings'), (s) => onSettings(s.exists() ? s.data() : {}), onError);
}

export const addTeam = (team) => addDoc(collection(db, 'teams'), { ...team, createdAt: serverTimestamp() });
export const updateTeam = (id, data) => updateDoc(doc(db, 'teams', id), data);

export async function deleteTeam(id, matches) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'teams', id));
  for (const m of matches) {
    if (m.homeTeamId === id || m.awayTeamId === id) batch.delete(doc(db, 'matches', m.id));
  }
  await batch.commit();
}

const newMatch = (m) => ({
  homeTeamId: m.homeTeamId,
  awayTeamId: m.awayTeamId,
  date: m.date || '',
  pitch: m.pitch || '',
  status: 'scheduled',
  goals: [],
  createdAt: serverTimestamp(),
});

export const addMatch = (m) => addDoc(collection(db, 'matches'), newMatch(m));

export async function addMatches(list) {
  for (let i = 0; i < list.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const m of list.slice(i, i + BATCH_LIMIT)) batch.set(doc(collection(db, 'matches')), newMatch(m));
    await batch.commit();
  }
}

export const updateMatch = (id, data) => updateDoc(doc(db, 'matches', id), data);
export const deleteMatch = (id) => deleteDoc(doc(db, 'matches', id));

async function deleteCollection(name) {
  const snap = await getDocs(collection(db, name));
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of snap.docs.slice(i, i + BATCH_LIMIT)) batch.delete(d.ref);
    await batch.commit();
  }
}

export const deleteAllMatches = () => deleteCollection('matches');

export async function resetAll() {
  await deleteCollection('matches');
  await deleteCollection('teams');
}

export const saveSettings = (data) => setDoc(doc(db, 'meta', 'settings'), data, { merge: true });
