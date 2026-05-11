# 🔥 Firebase Setup Guide — Step by Step
## (Free — No Credit Card Required)

Follow these steps to enable **universal real-time sync** so changes made by one user are instantly visible to all others.

---

## Step 1: Create a Firebase Project (5 minutes)

1. Go to **https://console.firebase.google.com/**
2. Click **"Add project"**
3. Enter a project name e.g. `timetable-od`
4. **Disable** Google Analytics (not needed) → Click **"Create project"**
5. Wait ~30 seconds for it to be created → Click **"Continue"**

---

## Step 2: Register a Web App

1. On the project dashboard, click the **`</>`** (Web) icon
2. Enter an App nickname e.g. `timetable-web`
3. **Do NOT** check "Firebase Hosting" (we use Vercel)
4. Click **"Register app"**
5. You'll see a config object like this — **copy it**:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "timetable-od.firebaseapp.com",
  projectId: "timetable-od",
  storageBucket: "timetable-od.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. Click **"Continue to console"**

---

## Step 3: Create `.env.local` File

In the project folder `TimeTableAdjustmentOD/`, create a file called **`.env.local`** (copy from `.env.local.example`) and fill in your values:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=timetable-od.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=timetable-od
VITE_FIREBASE_STORAGE_BUCKET=timetable-od.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

---

## Step 4: Enable Firestore Database

1. In Firebase Console → left sidebar → **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (allows read/write for 30 days — fine for school use)
4. Select a location closest to you e.g. `asia-south1` (Mumbai) → Click **"Enable"**

> **Note:** "Test mode" rules expire after 30 days. To make it permanent, go to Firestore → Rules and replace with:
> ```
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /{document=**} {
>       allow read, write: if true;
>     }
>   }
> }
> ```

---

## Step 5: For Vercel Deployment — Add Environment Variables

1. Go to **https://vercel.com/** → Your project → **Settings → Environment Variables**
2. Add each variable from `.env.local`:
   - `VITE_FIREBASE_API_KEY` → your value
   - `VITE_FIREBASE_AUTH_DOMAIN` → your value
   - `VITE_FIREBASE_PROJECT_ID` → your value
   - `VITE_FIREBASE_STORAGE_BUCKET` → your value
   - `VITE_FIREBASE_MESSAGING_SENDER_ID` → your value
   - `VITE_FIREBASE_APP_ID` → your value
3. Click **"Save"**
4. **Redeploy** the project (Deployments → Redeploy latest)

---

## Step 6: Test It!

1. Run `npm run dev` locally OR open the deployed Vercel URL
2. You should see a **🌐 Live Sync — All Users See This** green badge in the header
3. Open the same URL on two different browsers/devices
4. Make a change in one → it appears in the other **within 1-2 seconds** ✅

---

## What Gets Synced

| Data | Synced? |
|---|---|
| Absent teacher selections | ✅ Universal |
| Substitute assignments | ✅ Universal |
| Class values | ✅ Universal |
| Date & Day | ✅ Universal |
| Adjustment records (history) | ✅ Universal |
| School name, logo | ❌ Device-local |
| Period timings | ❌ Device-local |
| Google Sheet URL | ❌ Device-local |

---

## Troubleshooting

- **Badge shows "💾 Local Only"**: `.env.local` is missing or has wrong values
- **Badge shows "📴 Offline"**: Internet issue or Firestore rules blocking access
- **Data not syncing**: Check Firestore rules — ensure test mode is active OR rules allow read/write
