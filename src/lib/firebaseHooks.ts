// Custom hooks for Firebase Realtime Database operations
import { useState, useEffect } from 'react'
import { ref, onValue, set, push, remove, update, off } from 'firebase/database'
import { onAuthStateChanged, User } from 'firebase/auth'
import { database, auth } from './firebase'

// Hook for authentication state
export const useAuth = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing auth state first
    const existingUser = auth.currentUser
    if (existingUser) {
      console.log('🔐 Found existing user:', existingUser.email)
      setCurrentUser(existingUser)
      setLoading(false)
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔐 Auth state changed:', user ? user.email : 'No user')
      setCurrentUser(user)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { currentUser, loading }
}

// Hook to read data from a path with real-time updates
export const useRealtimeData = <T>(path: string) => {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dbRef = ref(database, path)
    
    const unsubscribe = onValue(dbRef, 
      (snapshot) => {
        const value = snapshot.val()
        setData(value)
        setLoading(false)
        setError(null)
      },
      (error) => {
        setError(error.message)
        setLoading(false)
      }
    )

    return () => off(dbRef, 'value', unsubscribe)
  }, [path])

  return { data, loading, error }
}

// Hook to write data to Firebase
export const useFirebaseWrite = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const writeData = async (path: string, data: any) => {
    setLoading(true)
    setError(null)
    try {
      await set(ref(database, path), data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pushData = async (path: string, data: any) => {
    setLoading(true)
    setError(null)
    try {
      const newRef = await push(ref(database, path), data)
      return newRef.key
    } catch (err: any) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const updateData = async (path: string, updates: any) => {
    setLoading(true)
    setError(null)
    try {
      await update(ref(database, path), updates)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteData = async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      await remove(ref(database, path))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { writeData, pushData, updateData, deleteData, loading, error }
}

// Hook for Dashboard real-time stats
export const useDashboardStats = (dateFilter?: { from?: string, to?: string }) => {
  const [stats, setStats] = useState({ totalTransactions: 0, matchedCount: 0, errorCount: 0, totalVolume: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dbRef = ref(database, 'reconciliation_records')
    
    const unsubscribe = onValue(dbRef, 
      (snapshot) => {
        try {
          const records = snapshot.val()
          if (records) {
            const recordArray = Object.entries(records).map(([id, data]: [string, any]) => ({ ...data, id }))
            
            // Apply date filter if provided
            let filteredRecords = recordArray
            if (dateFilter?.from && dateFilter?.to) {
              filteredRecords = recordArray.filter(record => 
                record.processedAt >= dateFilter.from! && record.processedAt <= dateFilter.to!
              )
            }
            
            const newStats = {
              totalTransactions: filteredRecords.length,
              matchedCount: filteredRecords.filter((r: any) => r.status === 'MATCHED').length,
              errorCount: filteredRecords.filter((r: any) => r.status !== 'MATCHED').length,
              totalVolume: filteredRecords.reduce((sum: number, r: any) => sum + (r.merchantData?.amount || 0), 0)
            }
            
            setStats(newStats)
          } else {
            setStats({ totalTransactions: 0, matchedCount: 0, errorCount: 0, totalVolume: 0 })
          }
          setLoading(false)
          setError(null)
        } catch (err: any) {
          setError(err.message)
          setLoading(false)
        }
      },
      (error) => {
        setError(error.message)
        setLoading(false)
      }
    )

    return () => off(dbRef, 'value', unsubscribe)
  }, [dateFilter?.from, dateFilter?.to])

  return { stats, loading, error }
}

// Hook for Reconciliation sessions history
export const useReconciliationHistory = (limit?: number) => {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dbRef = ref(database, 'reconciliation_sessions')
    
    const unsubscribe = onValue(dbRef, 
      (snapshot) => {
        try {
          const data = snapshot.val()
          if (data) {
            let sessionArray = Object.entries(data).map(([id, session]: [string, any]) => ({ ...session, id }))
            
            // Sort by creation time (newest first)
            sessionArray.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            
            // Apply limit if provided
            if (limit) {
              sessionArray = sessionArray.slice(0, limit)
            }
            
            setSessions(sessionArray)
          } else {
            setSessions([])
          }
          setLoading(false)
          setError(null)
        } catch (err: any) {
          setError(err.message)
          setLoading(false)
        }
      },
      (error) => {
        setError(error.message)
        setLoading(false)
      }
    )

    return () => off(dbRef, 'value', unsubscribe)
  }, [limit])

  return { sessions, loading, error }
}

// Hook for Payment stats
export const usePaymentStats = () => {
  const [stats, setStats] = useState({ totalPending: 0, totalPaid: 0, totalAmount: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dbRef = ref(database, 'payments')
    
    const unsubscribe = onValue(dbRef, 
      (snapshot) => {
        try {
          const payments = snapshot.val()
          if (payments) {
            const paymentArray = Object.entries(payments).map(([id, payment]: [string, any]) => ({ ...payment, id }))
            
            const newStats = {
              totalPending: paymentArray.filter((p: any) => p.status === 'PENDING').length,
              totalPaid: paymentArray.filter((p: any) => p.status === 'PAID').length,
              totalAmount: paymentArray.reduce((sum: number, p: any) => sum + (p.netAmount || 0), 0)
            }
            
            setStats(newStats)
          } else {
            setStats({ totalPending: 0, totalPaid: 0, totalAmount: 0 })
          }
          setLoading(false)
          setError(null)
        } catch (err: any) {
          setError(err.message)
          setLoading(false)
        }
      },
      (error) => {
        setError(error.message)
        setLoading(false)
      }
    )

    return () => off(dbRef, 'value', unsubscribe)
  }, [])

  return { stats, loading, error }
}

// Hook for Settings real-time updates
export const useSettings = () => {
  const [settings, setSettings] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dbRef = ref(database, 'settings')
    
    const unsubscribe = onValue(dbRef, 
      (snapshot) => {
        try {
          const data = snapshot.val()
          setSettings(data || {})
          setLoading(false)
          setError(null)
        } catch (err: any) {
          setError(err.message)
          setLoading(false)
        }
      },
      (error) => {
        setError(error.message)
        setLoading(false)
      }
    )

    return () => off(dbRef, 'value', unsubscribe)
  }, [])

  return { settings, loading, error }
}

// Utility functions for common operations
export const FirebaseUtils = {
  // Generate a new push key
  generateId: () => push(ref(database)).key,
  
  // Get current timestamp
  getServerTimestamp: () => new Date().toISOString(),
  
  // Convert Firebase object to array with IDs
  objectToArray: <T>(obj: Record<string, T> | null): Array<T & { id: string }> => {
    if (!obj) return []
    return Object.entries(obj).map(([id, data]) => ({ ...data, id }))
  }
}