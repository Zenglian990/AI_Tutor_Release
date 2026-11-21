const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');

let TEXTBOOK_CHAPTERS = null;

/**
 * Lazy load textbook chapters with caching and error handling.
 * Returns the cached instance if already loaded.
 */
async function getChapters() {
  if (TEXTBOOK_CHAPTERS) return TEXTBOOK_CHAPTERS;
  
  try {
    const dataPath = path.join(__dirname, '..', 'prompts', 'chapters.json');
    const data = await fs.promises.readFile(dataPath, 'utf8');
    TEXTBOOK_CHAPTERS = JSON.parse(data);
    return TEXTBOOK_CHAPTERS;
  } catch (err) {
    logger.error('Failed to load chapters.json. Returning empty array.', err);
    return [];
  }
}

module.exports = {
  getChapters
};
