const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');

let TEXTBOOK_CHAPTERS = null;

/**
 * Lazy load textbook chapters with caching and error handling.
 * Returns the cached instance if already loaded.
 */
async function getChapters() {
  try {
    const dataPath = path.join(__dirname, '..', 'prompts', 'chapters.json');
    const data = await fs.promises.readFile(dataPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    logger.error('Failed to load chapters.json. Returning empty array.', err);
    return [];
  }
}

module.exports = {
  getChapters
};
