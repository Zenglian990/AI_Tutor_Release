const logger = require('./logger');

class TaskQueue {
  constructor() {
    this.queue = Promise.resolve();
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          logger.error("[DbQueue] Error executing queued database task:", err);
          reject(err);
        }
      });
    });
  }
}

const dbQueue = new TaskQueue();
module.exports = dbQueue;
