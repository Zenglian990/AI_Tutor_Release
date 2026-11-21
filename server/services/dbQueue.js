const { AsyncLocalStorage } = require('async_hooks');
const logger = require('./logger');

class TaskQueue {
  constructor(maxSize = 5000) {
    this.queue = Promise.resolve();
    this.size = 0;
    this.maxSize = maxSize;
    this.als = new AsyncLocalStorage();
  }

  enqueue(task, timeoutMs = 15000) {
    // 重入保护：若当前异步上下文已处于 dbQueue 串行临界区内（如 stream.js -> streakService），
    // 直接内联执行以避免永久自死锁。
    if (this.als.getStore() === true) {
      return Promise.resolve().then(() => task({ isTimedOut: () => false }));
    }

    if (this.size >= this.maxSize) {
      logger.error(`Database queue backpressure limit exceeded (${this.maxSize})`);
      return Promise.reject(new Error('Queue backpressure limit exceeded'));
    }

    if (this.size > this.maxSize * 0.8) {
      logger.warn(`Database queue is at ${Math.round((this.size / this.maxSize) * 100)}% capacity (${this.size}/${this.maxSize})`);
    }

    this.size++;
    return new Promise((resolve, reject) => {
      let timer = null;
      let timedOut = false;

      // 排队+执行总等待保护，防止队列严重拥堵时请求无限挂起
      const queueWaitLimit = timeoutMs * 2;
      const waitTimer = setTimeout(() => {
        if (!timedOut) {
          timedOut = true;
          reject(new Error(`Database queue wait timed out after ${queueWaitLimit}ms`));
        }
      }, queueWaitLimit);

      this.queue = this.queue.then(async () => {
        clearTimeout(waitTimer);
        if (timedOut) {
          this.size = Math.max(0, this.size - 1);
          return;
        }

        try {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error(`Database task timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          const result = await this.als.run(true, () => task({ isTimedOut: () => timedOut }));

          if (!timedOut) {
            clearTimeout(timer);
            resolve(result);
          }
        } catch (err) {
          if (!timedOut) {
            clearTimeout(timer);
            reject(err);
          } else {
            logger.error('Database task threw error after timeout:', err);
          }
        } finally {
          if (timer) clearTimeout(timer);
          this.size = Math.max(0, this.size - 1);
        }
      });
    });
  }

  async drain() {
    await this.queue;
  }
}

const dbQueue = new TaskQueue();
module.exports = dbQueue;
