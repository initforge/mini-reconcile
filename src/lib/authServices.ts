// Authentication services for User and Agent
import { ref, get, set, push } from 'firebase/database';
import { database } from './firebase';
import { FirebaseUtils } from './firebaseHooks';
import type { User, Agent } from '../../types';

// Password hashing using Web Crypto API
const SALT_LENGTH = 16;
const ITERATIONS = 100000;
const KEY_LENGTH = 64;

/**
 * Generate random salt
 */
const generateSalt = (): string => {
  const array = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Convert string to ArrayBuffer
 */
const stringToArrayBuffer = (str: string): ArrayBuffer => {
  const encoder = new TextEncoder();
  return encoder.encode(str);
};

/**
 * Convert ArrayBuffer to hex string
 */
const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Hash password using Web Crypto API (PBKDF2)
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = generateSalt();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: stringToArrayBuffer(salt),
      iterations: ITERATIONS,
      hash: 'SHA-512'
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  
  const hash = arrayBufferToHex(derivedBits);
  return `${salt}:${hash}`;
};

/**
 * Verify password against hash
 */
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  if (!hash || !hash.includes(':')) {
    console.log('❌ Invalid hash format (missing colon)');
    return false;
  }
  
  const [salt, storedHash] = hash.split(':');
  if (!salt || !storedHash) {
    console.log('❌ Invalid hash format (missing salt or hash)');
    return false;
  }
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    stringToArrayBuffer(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: stringToArrayBuffer(salt),
      iterations: ITERATIONS,
      hash: 'SHA-512'
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  
  const computedHash = arrayBufferToHex(derivedBits);
  return computedHash === storedHash;
};

/**
 * Login user with username and password
 */
export const loginUser = async (phone: string, password: string): Promise<User | null> => {
  try {
    console.log('🔐 Attempting login for phone:', phone);
    const snapshot = await get(ref(database, 'users'));
    const users = FirebaseUtils.objectToArray<User>(snapshot.val() || {});
    console.log('📊 Total users found:', users.length);
    
    // Log all phones for debugging
    console.log('👥 All phones in database:', users.map(u => u.phone || 'N/A'));
    
    const input = phone.trim();
    
    // Find user by phone (exact match, case-sensitive để khớp "x" và "X")
    const user = users.find(u => {
      return u.phone && u.phone.trim() === input;
    });
    
    if (!user) {
      console.log('❌ User not found for phone:', phone);
      console.log('💡 Available phones:', users.map(u => u.phone || 'N/A'));
      return null;
    }
    
    console.log('✅ User found, checking password...');
    if (!user.password) {
      console.log('❌ User has no password set');
      return null;
    }
    
    // Simple plain text comparison (no hashing required)
    const isValid = password === user.password;
    console.log('🔑 Password check result:', isValid);
    
    if (!isValid) {
      return null;
    }
    
    // Update lastActive
    const { password: _, ...userWithoutPassword } = user;
    console.log('✅ Login successful for user:', user.phone);
    return userWithoutPassword as User;
  } catch (error) {
    console.error('❌ Error logging in user:', error);
    return null;
  }
};

/**
 * Login agent with contactPhone and password
 */
export const loginAgent = async (phone: string, password: string): Promise<Agent | null> => {
  try {
    console.log('🔐 Attempting agent login for phone:', phone);
    const snapshot = await get(ref(database, 'agents'));
    const agents = FirebaseUtils.objectToArray<Agent>(snapshot.val() || {});
    console.log('📊 Total agents found:', agents.length);
    
    const agent = agents.find(a => a.contactPhone === phone && a.isActive !== false);
    if (!agent) {
      console.log('❌ Agent not found or inactive for phone:', phone);
      return null;
    }
    
    console.log('✅ Agent found:', agent.code);
    if (!agent.password) {
      console.log('❌ Agent has no password set');
      return null;
    }
    
    // Simple plain text comparison (no hashing required)
    console.log('🔑 Checking password...');
    const isValid = password === agent.password;
    console.log('🔑 Password check result:', isValid);
    
    if (!isValid) {
      return null;
    }
    
    // Return agent without password
    const { password: _, ...agentWithoutPassword } = agent;
    console.log('✅ Agent login successful:', agent.code);
    return agentWithoutPassword as Agent;
  } catch (error) {
    console.error('❌ Error logging in agent:', error);
    return null;
  }
};

/**
 * Register new user
 */
export const registerUser = async (
  phone: string,
  password: string,
  fullName: string,
  email?: string
): Promise<string | null> => {
  try {
    console.log('📝 Registering new user with phone:', phone);
    
    // Check if phone already exists
    let users: Array<User & { id: string }> = [];
    try {
      const snapshot = await get(ref(database, 'users'));
      const snapshotVal = snapshot.val();
      console.log('📊 Snapshot value:', snapshotVal);
      
      // Handle null or empty database
      if (!snapshotVal) {
        console.log('📊 Database is empty, no existing users');
        users = [];
      } else {
        users = FirebaseUtils.objectToArray<User>(snapshotVal);
        console.log('📊 Total users found:', users.length);
        console.log('📊 All phones in database:', users.map(u => u.phone || 'N/A'));
      }
    } catch (dbError: any) {
      console.error('❌ Error reading from database:', dbError);
      // If it's a permission error, we can still try to save (might work)
      if (dbError.message?.includes('Permission denied')) {
        console.warn('⚠️ Permission denied reading users, but will try to save anyway');
        users = [];
      } else {
        throw dbError; // Re-throw if it's not a permission error
      }
    }
    
    // Exact match check for existing phone (case-sensitive để khớp "x" và "X")
    const phoneExists = users.some(u => {
      if (!u.phone) return false;
      return u.phone.trim() === phone.trim();
    });
    
    if (phoneExists) {
      console.log('❌ Phone already exists:', phone);
      return null; // Phone already exists
    }
    
    // Check if email already exists (if provided)
    if (email && email.trim()) {
      const emailExists = users.some(u => {
        if (!u.email) return false;
        return u.email.toLowerCase().trim() === email.toLowerCase().trim();
      });
      
      if (emailExists) {
        console.log('❌ Email already exists:', email);
        return null; // Email already exists
      }
    }
    
    // Save password as plain text (no hashing)
    console.log('💾 Saving user with plain text password...');
    
    // Create user - remove undefined fields (Firebase doesn't accept undefined)
    const newUser: any = {
      phone: phone.trim(), // Required, unique identifier
      password: password, // Plain text password
      fullName: fullName.trim(),
      createdAt: FirebaseUtils.getServerTimestamp(),
      lastActive: FirebaseUtils.getServerTimestamp()
    };
    
    // Only add email if provided (don't include undefined)
    if (email && email.trim()) {
      newUser.email = email.trim();
    }
    
    // Don't include qrCodeBase64 if undefined (will be added later if needed)
    
    console.log('💾 Saving user to Firebase...', newUser);
    
    // Save to Firebase
    const newRef = await push(ref(database, 'users'), newUser);
    console.log('✅ User registered successfully with ID:', newRef.key);
    return newRef.key;
  } catch (error: any) {
    console.error('❌ Error registering user:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    // Re-throw with more details for better error handling
    throw new Error(`Đăng ký thất bại: ${error.message || 'Lỗi không xác định'}`);
  }
};

