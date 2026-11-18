import mongoose, { type ClientSession } from 'mongoose';

let supportsTransactionsCache: boolean | null = null;

export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri, {
    autoIndex: true,
  });
  supportsTransactionsCache = null;
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  supportsTransactionsCache = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export async function isReplicaSetAvailable(): Promise<boolean> {
  if (supportsTransactionsCache !== null) {
    return supportsTransactionsCache;
  }
  try {
    const admin = mongoose.connection.db?.admin();
    if (!admin) {
      supportsTransactionsCache = false;
      return false;
    }
    const hello = await admin.command({ hello: 1 });
    supportsTransactionsCache = Boolean(hello.setName || hello.msg === 'isdbgrid');
    return supportsTransactionsCache;
  } catch {
    supportsTransactionsCache = false;
    return false;
  }
}

/**
 * Executes a multi-document operation inside a MongoDB ACID transaction
 * whenever connected to a Replica Set / Sharded Cluster (e.g., Atlas or
 * MongoMemoryReplSet in tests), with clean fallback on standalone dev instances.
 */
export async function withTransaction<T>(
  work: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  const canTransact = await isReplicaSetAvailable();
  if (!canTransact) {
    return work(undefined);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
