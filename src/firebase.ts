// ── FIREBASE CONFIGURATION ────────────────────────────────────────────────────
// This file initialises Firebase and exports Firestore helpers used by App.tsx.
// All environment variables must be set in .env.local (see .env.local.example).
// If Firebase is not configured, the app falls back to localStorage automatically.

import { initializeApp, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  getDocs,
  deleteDoc,
  Firestore,
  Unsubscribe,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";

// ── Config from environment variables ────────────────────────────────────────
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// ── Check if Firebase is properly configured ──────────────────────────────────
export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.apiKey !== "YOUR_API_KEY"
  );
};

// ── Lazy-initialise Firebase (only if configured) ─────────────────────────────
let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function getDb(): Firestore | null {
  if (!isFirebaseConfigured()) return null;
  if (!db) {
    try {
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
    } catch (e) {
      console.error("Firebase init failed:", e);
      return null;
    }
  }
  return db;
}

// ── Firestore Collection / Document paths ────────────────────────────────────
const CURRENT_DOC = "current";
const TIMETABLE_COLLECTION = "timetable-adjustment";
const RECORDS_COLLECTION = "adjustment-records";

// ── Types (mirrors App.tsx) ───────────────────────────────────────────────────
export interface Column {
  id: number;
  selectedTeacher: string;
  substituteTeacher: string[];
  classValues: string[];
}

export interface AdjustmentRecord {
  id: string;
  date: string;
  day: string;
  timestamp: number;
  columns: Column[];
  totalTeachers: number;
  totalSubstitutes: number;
}

export interface CurrentAdjustment {
  columns: Column[];
  date: string;
  day: string;
  updatedAt?: unknown; // serverTimestamp
}

// ── Save today's active adjustment ───────────────────────────────────────────
export async function saveCurrentAdjustment(
  data: Omit<CurrentAdjustment, "updatedAt">
): Promise<boolean> {
  const firestore = getDb();
  if (!firestore) return false;
  try {
    await setDoc(
      doc(firestore, TIMETABLE_COLLECTION, CURRENT_DOC),
      { ...data, updatedAt: serverTimestamp() },
      { merge: false }
    );
    return true;
  } catch (e) {
    console.error("saveCurrentAdjustment failed:", e);
    return false;
  }
}

// ── Subscribe to today's adjustment (real-time) ───────────────────────────────
export function subscribeToCurrentAdjustment(
  callback: (data: CurrentAdjustment | null) => void
): Unsubscribe | null {
  const firestore = getDb();
  if (!firestore) return null;
  try {
    return onSnapshot(
      doc(firestore, TIMETABLE_COLLECTION, CURRENT_DOC),
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as CurrentAdjustment);
        } else {
          callback(null);
        }
      },
      (err) => {
        console.error("subscribeToCurrentAdjustment error:", err);
        callback(null);
      }
    );
  } catch (e) {
    console.error("subscribeToCurrentAdjustment failed:", e);
    return null;
  }
}

// ── Save a dated adjustment record (history) ─────────────────────────────────
export async function saveAdjustmentRecord(
  record: AdjustmentRecord
): Promise<boolean> {
  const firestore = getDb();
  if (!firestore) return false;
  try {
    // Use date as document ID (replacing / with - for safe doc IDs)
    const docId = record.date.replace(/\//g, "-");
    await setDoc(
      doc(firestore, RECORDS_COLLECTION, docId),
      record,
      { merge: false }
    );
    return true;
  } catch (e) {
    console.error("saveAdjustmentRecord failed:", e);
    return false;
  }
}

// ── Subscribe to all records (real-time) ─────────────────────────────────────
export function subscribeToRecords(
  callback: (records: AdjustmentRecord[]) => void
): Unsubscribe | null {
  const firestore = getDb();
  if (!firestore) return null;
  try {
    const q = query(
      collection(firestore, RECORDS_COLLECTION),
      orderBy("timestamp", "desc")
    );
    return onSnapshot(
      q,
      (snap) => {
        const records: AdjustmentRecord[] = snap.docs.map(
          (d) => d.data() as AdjustmentRecord
        );
        callback(records);
      },
      (err) => {
        console.error("subscribeToRecords error:", err);
        callback([]);
      }
    );
  } catch (e) {
    console.error("subscribeToRecords failed:", e);
    return null;
  }
}

// ── Delete a record ───────────────────────────────────────────────────────────
export async function deleteAdjustmentRecord(date: string): Promise<boolean> {
  const firestore = getDb();
  if (!firestore) return false;
  try {
    const docId = date.replace(/\//g, "-");
    await deleteDoc(doc(firestore, RECORDS_COLLECTION, docId));
    return true;
  } catch (e) {
    console.error("deleteAdjustmentRecord failed:", e);
    return false;
  }
}

// ── Fetch all records once (non-real-time) ────────────────────────────────────
export async function fetchAllRecords(): Promise<AdjustmentRecord[]> {
  const firestore = getDb();
  if (!firestore) return [];
  try {
    const snap = await getDocs(collection(firestore, RECORDS_COLLECTION));
    return snap.docs
      .map((d) => d.data() as AdjustmentRecord)
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.error("fetchAllRecords failed:", e);
    return [];
  }
}
