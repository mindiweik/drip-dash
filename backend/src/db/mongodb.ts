import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'drip-dash';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToMongoDB(): Promise<Db> {
  if (db) {
    return db;
  }

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`Connected to MongoDB: ${DB_NAME}`);
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectFromMongoDB(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('Disconnected from MongoDB');
  }
}

export async function getDb(): Promise<Db> {
  if (!db) {
    return await connectToMongoDB();
  }
  return db;
}

export async function checkMongoDBConnection(): Promise<boolean> {
  try {
    if (!db) {
      await connectToMongoDB();
    }
    // Ping the database to check connection
    await db!.admin().ping();
    return true;
  } catch (error) {
    console.error('MongoDB connection check failed:', error);
    return false;
  }
}
