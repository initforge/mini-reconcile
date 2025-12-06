// Firebase configuration for PayReconcile Pro
import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDcVtQ_X70gvYAhqNglg2R_pRP0Rq6gDQ4",
  authDomain: "qrupcode.firebaseapp.com",
  databaseURL: "https://qrupcode-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qrupcode",
  storageBucket: "qrupcode.firebasestorage.app",
  messagingSenderId: "949524369430",
  appId: "1:949524369430:web:3614ebc29f315c3cbb6537",
  measurementId: "G-0TGZZ2EH7C"
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