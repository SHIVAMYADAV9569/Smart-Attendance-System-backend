import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const fixIndexes = async () => {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/face-attendance');
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    
    // Check if collection exists
    const collections = await db.listCollections({ name: 'users' }).toArray();
    if (collections.length === 0) {
      console.log('ℹ️ Users collection does not exist yet. Creating it...');
      await db.createCollection('users');
    }
    
    const collection = db.collection('users');

    // Get all indexes
    console.log('📋 Current indexes:');
    const indexes = await collection.indexes();
    console.log(indexes);

    // Drop the enrollmentNumber unique index if it exists
    try {
      await collection.dropIndex('enrollmentNumber_1');
      console.log('✅ Dropped enrollmentNumber_1 index');
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️ enrollmentNumber_1 index does not exist');
      } else {
        console.error('❌ Error dropping index:', err.message);
      }
    }

    // Also try to drop any index on enrollmentNumber
    const enrollmentIndex = indexes.find(idx => 
      idx.key && idx.key.enrollmentNumber !== undefined
    );
    
    if (enrollmentIndex) {
      try {
        await collection.dropIndex(enrollmentIndex.name);
        console.log(`✅ Dropped index: ${enrollmentIndex.name}`);
      } catch (err) {
        console.error('❌ Error dropping index:', err.message);
      }
    }

    console.log('\n📋 Indexes after fix:');
    const newIndexes = await collection.indexes();
    console.log(newIndexes);

    console.log('\n✅ Index fix complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

fixIndexes();
