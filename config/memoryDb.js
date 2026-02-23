// In-memory database for development when MongoDB is unavailable
// With file-based persistence
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, 'memoryDb.json');

// Load data from file if it exists
let users = [];
let attendanceRecords = [];

// Mock User class
export class UserMock {
  constructor(data, isReconstructing = false) {
    this._id = data._id || Math.random().toString(36).substr(2, 9);
    this.name = data.name;
    this.email = data.email;
    this.password = data.password;
    this.role = data.role || 'student';
    this.enrollmentNumber = data.enrollmentNumber;
    this.rollNumber = data.rollNumber;
    this.department = data.department;
    this.course = data.course;
    this.faceData = data.faceData || null;
    this.isActive = data.isActive !== undefined ? data.isActive : true;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this._isReconstructing = isReconstructing;
  }

  async save() {
    console.log(`💾 UserMock.save() called for email: ${this.email}`);
    console.log(`📊 Current users in memory: ${users.length}`);
    console.log(`📊 Existing emails:`, users.map(u => u.email));
    
    // Skip duplicate check if reconstructing from file
    if (this._isReconstructing) {
      console.log(`🔄 Reconstructing user from file, skipping duplicate check`);
      users.push(this);
      return this;
    }
    
    // Check if email already exists
    const exists = users.find(u => u.email === this.email);
    if (exists) {
      console.log(`❌ Email ${this.email} already exists!`);
      const error = new Error('Email already registered');
      error.code = 11000;
      throw error;
    }
    users.push(this);
    saveToFile(); // Persist changes
    console.log(`✅ User saved in memory: ${this._id} (${this.email})`);
    console.log(`📊 Total users in memory: ${users.length}`);
    return this;
  }

  async comparePassword(password) {
    const bcrypt = (await import('bcryptjs')).default;
    return await bcrypt.compare(password, this.password);
  }

  static async findOne(query) {
    console.log('🔍 UserMock.findOne called with:', JSON.stringify(query));
    console.log('🔍 Current users count:', users.length);
    console.log('🔍 Current users array:', users);
    
    if (!query || typeof query !== 'object') {
      console.log('⚠️ Invalid query, returning null');
      return null;
    }

    if (query.email) {
      console.log(`🔍 Searching for email: "${query.email}"`);
      console.log(`🔍 All emails in DB:`, users.map(u => `"${u.email}"`));
      const user = users.find(u => {
        console.log(`  Comparing: "${u.email}" === "${query.email}" => ${u.email === query.email}`);
        return u.email === query.email;
      });
      console.log(`🔍 Search result:`, user ? `Found user: ${user.email}` : 'Not found');
      return user || null;
    }
    if (query._id) {
      const user = users.find(u => u._id === query._id);
      console.log(`🔍 Searching by _id: ${query._id}, Found:`, user ? 'Yes' : 'No');
      return user || null;
    }
    
    // If no specific field matched, try to find by any matching field
    const keys = Object.keys(query);
    if (keys.length > 0) {
      const user = users.find(u => {
        return keys.every(key => u[key] === query[key]);
      });
      console.log(`🔍 Searching by fields: ${keys.join(', ')}, Found:`, user ? 'Yes' : 'No');
      return user || null;
    }
    
    console.log('⚠️ No query criteria matched, returning null');
    return null;
  }

  static async findById(id) {
    console.log(`🔍 Looking for user: ${id}`);
    console.log(`📊 Users in memory: ${users.map(u => u._id).join(', ')}`);
    const user = users.find(u => u._id === id) || null;
    if (user) {
      console.log(`✅ User found: ${user._id}`);
    } else {
      console.log(`❌ User not found with ID: ${id}`);
    }
    return user;
  }

  static async updateOne(filter, update) {
    const user = users.find(u => u._id === filter._id);
    if (user) {
      Object.assign(user, update.$set || update);
      saveToFile(); // Persist changes
    }
    return { acknowledged: true };
  }
}

// Mock Attendance class
export class AttendanceMock {
  constructor(data) {
    this._id = Math.random().toString(36).substr(2, 9);
    this.userId = data.userId;
    this.date = data.date || new Date();
    this.checkInTime = data.checkInTime;
    this.checkOutTime = data.checkOutTime;
    this.status = data.status || 'present';
    this.faceConfidence = data.faceConfidence;
    this.ipAddress = data.ipAddress;
  }

  async save() {
    attendanceRecords.push(this);
    saveToFile(); // Persist changes
    return this;
  }

  static async find(query) {
    return attendanceRecords.filter(r => {
      if (query.userId && r.userId !== query.userId) return false;
      if (query.date && r.date !== query.date) return false;
      return true;
    });
  }

  static async findOne(query) {
    return attendanceRecords.find(r => {
      if (query.userId && r.userId !== query.userId) return false;
      
      if (query.date) {
        const queryDate = typeof query.date === 'object' ? query.date : new Date(query.date);
        const recordDate = new Date(r.date);
        
        // Compare dates without time
        const queryDateOnly = new Date(queryDate);
        queryDateOnly.setHours(0, 0, 0, 0);
        
        const recordDateOnly = new Date(recordDate);
        recordDateOnly.setHours(0, 0, 0, 0);
        
        if (queryDateOnly.getTime() !== recordDateOnly.getTime()) return false;
      }
      
      return true;
    }) || null;
  }

  static async findById(id) {
    return attendanceRecords.find(r => r._id === id) || null;
  }
}

const saveToFile = () => {
  try {
    fs.writeFileSync(dbFile, JSON.stringify({ users, attendanceRecords }, null, 2));
  } catch (error) {
    console.error('❌ Error saving to file:', error.message);
  }
};

const loadFromFile = () => {
  try {
    if (fs.existsSync(dbFile)) {
      const data = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
      // Reconstruct UserMock instances to preserve methods
      users = (data.users || []).map(userData => {
        // Create a new UserMock instance with reconstruction flag
        const userMock = new UserMock({
          _id: userData._id,
          name: userData.name,
          email: userData.email,
          password: userData.password,
          role: userData.role,
          enrollmentNumber: userData.enrollmentNumber,
          department: userData.department,
          faceData: userData.faceData,
          isActive: userData.isActive,
          createdAt: userData.createdAt
        }, true); // true = isReconstructing
        return userMock;
      });
      // Reconstruct AttendanceMock instances
      attendanceRecords = (data.attendanceRecords || []).map(attendanceData => {
        const attendanceMock = new AttendanceMock({
          userId: attendanceData.userId,
          date: attendanceData.date,
          checkInTime: attendanceData.checkInTime,
          checkOutTime: attendanceData.checkOutTime,
          status: attendanceData.status,
          faceConfidence: attendanceData.faceConfidence,
          ipAddress: attendanceData.ipAddress
        });
        attendanceMock._id = attendanceData._id; // Preserve the original ID
        return attendanceMock;
      });
      console.log(`📂 Loaded ${users.length} users and ${attendanceRecords.length} attendance records from file`);
      console.log(`📂 Users in memory:`, users.map(u => ({ id: u._id, email: u.email, hasComparePassword: typeof u.comparePassword === 'function' })));
    }
  } catch (error) {
    console.error('❌ Error loading from file:', error.message);
  }
};

// Load on startup
loadFromFile();

// Function to clear all data
export const clearAllData = () => {
  users = [];
  attendanceRecords = [];
  saveToFile();
  console.log('🗑️ All data cleared from memory');
};

export const memoryDb = {
  get users() { return users; },
  set users(value) { users = value; },
  get attendanceRecords() { return attendanceRecords; },
  set attendanceRecords(value) { attendanceRecords = value; },
  saveToFile,
  clearAllData
};
