import { createShareServer } from './server.js';
import { createStore } from './storage.js';

const store = createStore({
  mode: process.env.STORE ?? 'memory',
  sqlitePath: process.env.SQLITE_PATH ?? 'env-share.sqlite',
});
const clock = () => Math.floor(Date.now() / 1000);
const cleanupBatchSize = Number(process.env.CLEANUP_BATCH_SIZE ?? 1_000);

function cleanup() {
  try {
    store.cleanup(clock(), cleanupBatchSize);
  } catch (error) {
    console.error('cleanup failed', error);
  }
}

cleanup();
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1_000);
cleanupTimer.unref();

const { server, postLimiter, getLimiter } = createShareServer({
  store,
  appOrigin: process.env.APP_ORIGIN,
  clock,
  postLimit: Number(process.env.POST_RATE_LIMIT ?? 10),
  getLimit: Number(process.env.GET_RATE_LIMIT ?? 120),
});

const port = Number(process.env.PORT ?? 3_000);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`env-share JavaScript server listening on ${port} (${process.env.STORE ?? 'memory'})`);
});

const limiterTimer = setInterval(() => {
  postLimiter.cleanup();
  getLimiter.cleanup();
}, 60_000);
limiterTimer.unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(cleanupTimer);
  clearInterval(limiterTimer);
  server.close(() => {
    store.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => {
    server.closeAllConnections();
    store.close();
    process.exit(1);
  }, 10_000).unref();
  console.log(`received ${signal}; shutting down`);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
