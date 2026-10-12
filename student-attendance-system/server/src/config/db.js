const mongoose = require('mongoose');
let connectionPromise;
const connectDB = () => {
    if (mongoose.connection.readyState === 1) return Promise.resolve();
    if (connectionPromise) return connectionPromise;
    connectionPromise = (async () => {
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                if (!process.env.MONGODB_URI) throw new Error('Missing database configuration');
                await mongoose.connect(process.env.MONGODB_URI, { family: 4, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
                console.log('MongoDB connected.');
                return;
            } catch {
                console.error(`MongoDB connection failed (attempt ${attempt}/5).`);
                if (attempt === 5) throw new Error('Database connection unavailable');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    })().finally(() => { connectionPromise = undefined; });
    return connectionPromise;
};
module.exports = connectDB;
