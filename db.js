const mongoose = require('mongoose');

const LOCAL_FALLBACK_URI = 'mongodb://127.0.0.1:27017/procsispeak';
const SERVER_SELECTION_TIMEOUT_MS = 5000;

function getUri() {
  return process.env.MONGODB_URI || LOCAL_FALLBACK_URI;
}

const connectDB = async () => {
  const uri = getUri();
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
};

module.exports = { connectDB, getUri };
