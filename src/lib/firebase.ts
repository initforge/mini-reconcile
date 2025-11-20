// Firebase configuration for PayReconcile Pro
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyAXRZHm1_sJbtBvwVNqhQrimLFz-weFT7Q",
  authDomain: "billgiaodich-10ae9.firebaseapp.com",
  databaseURL: "https://billgiaodich-10ae9-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "billgiaodich-10ae9",
  storageBucket: "billgiaodich-10ae9.firebasestorage.app",
  messagingSenderId: "899833329716",
  appId: "1:899833329716:web:df99dd8d5c1d40cae17261",
  measurementId: "G-QYG88PPTNN"
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase services
export const database = getDatabase(app)
export const auth = getAuth(app)

// Set auth persistence to maintain login across page reloads
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Failed to set auth persistence:', error)
})

// Export app for other uses if needed
export { app }