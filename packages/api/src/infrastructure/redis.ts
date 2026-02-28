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

export const redis = new Redis(redisOptions);

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));

/**
 * Separate connection for BullMQ (it needs its own dedicated connection).
 */
export function createBullMQConnection(): Redis {
  return new Redis({ ...redisOptions, lazyConnect: true });
}
