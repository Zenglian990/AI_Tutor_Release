const fs = require('fs');
const path = require('path');

const TOPICS_URL = 'https://raw.githubusercontent.com/xiaoyang111222/cn-math-taxonomy/main/data/topics.json';
const DEPS_URL = 'https://raw.githubusercontent.com/xiaoyang111222/cn-math-taxonomy/main/data/dependencies.json';

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOPICS_FILE = path.join(DATA_DIR, 'pep_topics.json');
const DEPS_FILE = path.join(DATA_DIR, 'pep_dependencies.json');

async function main() {
  console.log('[Ingest] Fetching topics from:', TOPICS_URL);
  const topicsRes = await fetch(TOPICS_URL);
  if (!topicsRes.ok) throw new Error(`Failed to fetch topics: ${topicsRes.status} ${topicsRes.statusText}`);
  const remoteTopics = await topicsRes.json();
  console.log(`[Ingest] Fetched ${remoteTopics.length} remote topics.`);

  console.log('[Ingest] Fetching dependencies from:', DEPS_URL);
  const depsRes = await fetch(DEPS_URL);
  if (!depsRes.ok) throw new Error(`Failed to fetch dependencies: ${depsRes.status} ${depsRes.statusText}`);
  const remoteDeps = await depsRes.json();
  console.log(`[Ingest] Fetched ${remoteDeps.length} remote dependencies.`);

  // Load existing topics and dependencies for backward compatibility
  let existingTopics = [];
  let existingDeps = [];
  if (fs.existsSync(TOPICS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8'));
      existingTopics = Array.isArray(parsed) ? parsed : (parsed.topics || []);
    } catch (e) {
      console.warn('[Ingest] Could not parse existing topics file:', e.message);
    }
  }
  if (fs.existsSync(DEPS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DEPS_FILE, 'utf-8'));
      existingDeps = Array.isArray(parsed) ? parsed : (parsed.dependencies || []);
    } catch (e) {
      console.warn('[Ingest] Could not parse existing deps file:', e.message);
    }
  }

  console.log(`[Ingest] Existing topics: ${existingTopics.length}, Existing dependencies: ${existingDeps.length}`);

  // Merge topics into map
  const topicMap = new Map();

  // 1. Remote topics first
  for (const t of remoteTopics) {
    if (!t.subject) {
      t.subject = 'math';
    }
    topicMap.set(t.id, t);
  }

  // 2. Existing topics if not present
  for (const t of existingTopics) {
    if (!topicMap.has(t.id)) {
      topicMap.set(t.id, t);
    }
  }

  const mergedTopics = Array.from(topicMap.values());

  // Merge dependencies into map
  const depMap = new Map();
  for (const d of remoteDeps) {
    const key = `${d.topicId}->${d.prerequisiteId}`;
    depMap.set(key, d);
  }

  for (const d of existingDeps) {
    const key = `${d.topicId}->${d.prerequisiteId}`;
    if (!depMap.has(key)) {
      depMap.set(key, d);
    }
  }

  const mergedDeps = Array.from(depMap.values());

  console.log(`[Ingest] Merged Total Topics: ${mergedTopics.length}`);
  console.log(`[Ingest] Merged Total Dependencies: ${mergedDeps.length}`);

  // Save to files in standardized format
  const topicsPayload = {
    version: 'cn-taxonomy-k12-v1',
    topicCount: mergedTopics.length,
    topics: mergedTopics
  };

  const depsPayload = {
    version: 'cn-taxonomy-k12-v1',
    dependencyCount: mergedDeps.length,
    dependencies: mergedDeps
  };

  fs.writeFileSync(TOPICS_FILE, JSON.stringify(topicsPayload, null, 2), 'utf-8');
  console.log(`[Ingest] Saved to ${TOPICS_FILE} (${fs.statSync(TOPICS_FILE).size} bytes)`);

  fs.writeFileSync(DEPS_FILE, JSON.stringify(depsPayload, null, 2), 'utf-8');
  console.log(`[Ingest] Saved to ${DEPS_FILE} (${fs.statSync(DEPS_FILE).size} bytes)`);

  console.log('[Ingest] Ingestion completed successfully!');
}

main().catch(err => {
  console.error('[Ingest] Fatal error:', err);
  process.exit(1);
});
