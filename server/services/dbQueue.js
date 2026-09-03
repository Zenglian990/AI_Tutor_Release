const logger = require('./logger');

class TaskQueue {
  constructor(maxSize = 5000) {
    this.queue = Promise.resolve();
    this.size = 0;
    this.maxSize = maxSize;
  }

  enqueue(task, timeoutMs = 15000) {
    if (this.size >= this.maxSize) {
      logger.error(`Database queue backpressure limit exceeded (${this.maxSize})`);
      return Promise.reject(new Error("Queue backpressure limit exceeded"));
    }
    
    if (this.size > this.maxSize * 0.8) {
      logger.warn(`Database queue is at ${Math.round((this.size / this.maxSize) * 100)}% capacity (${this.size}/${this.maxSize})`);
    }
    
    this.size++;
    return new Promise((resolve, reject) => {
      let timer;
      let timedOut = false;

      this.queue = this.queue.then(async () => {
        try {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new Error(`Database task timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          // We await task() directly instead of Promise.race.
          // This ensures we NEVER start the next task while this one is still running,
          // preventing SQLITE_BUSY deadlocks. The caller gets the timeout rejection above.
          const result = await task();

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
          this.size--;
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
