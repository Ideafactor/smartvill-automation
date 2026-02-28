import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'redis' });

const redisOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD ?? undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
};

/**
 * Create a dedicated BullMQ Redis connection.
 * BullMQ requires separate connections per Worker/Queue instance.
 */
export function createBullMQConnection(): Redis {
  const conn = new Redis({ ...redisOptions, lazyConnect: true });
  conn.on('error', (err) => logger.error({ err }, 'BullMQ Redis connection error'));
  return conn;
}
