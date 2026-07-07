const logger = require('./logger');

class TaskQueue {
  constructor(maxSize = 1000) {
    this.queue = Promise.resolve();
    this.size = 0;
    this.maxSize = maxSize;
  }

  enqueue(task) {
    if (this.size >= this.maxSize) {
      return Promise.reject(new Error("Queue backpressure limit exceeded"));
    }
    this.size++;
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          logger.error("[DbQueue] Error executing queued database task:", err);
          reject(err);
        } finally {
          this.size--;
        }
      });
    });
  }
}

const dbQueue = new TaskQueue();
module.exports = dbQueue;
