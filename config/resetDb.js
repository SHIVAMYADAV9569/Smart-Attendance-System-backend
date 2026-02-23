// Script to reset the memory database
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, 'memoryDb.json');

// Reset to empty database
const emptyDb = {
  users: [],
  attendanceRecords: []
};

try {
  fs.writeFileSync(dbFile, JSON.stringify(emptyDb, null, 2));
  console.log('✅ Database reset successfully!');
  console.log('📝 All users and attendance records have been cleared.');
} catch (error) {
  console.error('❌ Error resetting database:', error.message);
}
