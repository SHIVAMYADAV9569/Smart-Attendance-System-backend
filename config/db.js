import mongoose from "mongoose";

const connectDb = async () => {
    let retries = 5;
    while (retries) {
        try {
            await mongoose.connect(process.env.MONGODB_URL, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            console.log("✅ DB Connected Successfully");
            return;
        } catch (error) {
            retries -= 1;
            console.error(`❌ DB Connection Error (Retries left: ${retries}):`, error.message);
            if (retries === 0) {
                console.warn("⚠️  Could not connect to MongoDB. Make sure:");
                console.warn("   1. Your IP is whitelisted in MongoDB Atlas");
                console.warn("   2. Connection string is correct");
                console.warn("   3. MongoDB Atlas cluster is active");
                console.warn("Server running without DB - API calls will fail");
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
};

export default connectDb;
export const isDbConnected = () => {
    try {
        return mongoose.connection && mongoose.connection.readyState === 1;
    } catch (e) {
        return false;
    }
};