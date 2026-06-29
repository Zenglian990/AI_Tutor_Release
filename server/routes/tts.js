const express = require('express');
const router = express.Router();
const { synthesizeSpeech } = require('../services/tts-service');
const logger = require('../services/logger');

// GET /api/tts
router.get('/tts', async (req, res) => {
  try {
    const { text, grade, voice } = req.query;
    if (!text) {
      return res.status(400).json({ error: 'Text parameter is required' });
    }

    // Determine voice based on grade or parameters
    // Child: zh-CN-XiaoxiaoNeural (1-3 grade) → mapped to Kore inside tts-service
    // Teen/Adult: zh-CN-YunxiNeural (4-9 grade) → mapped to Puck inside tts-service
    let selectedVoice = voice || 'zh-CN-XiaoxiaoNeural';
    if (!voice && grade) {
      const rawGradeNum = parseInt(String(grade).split('_')[0]);
      const isLowerGrade = rawGradeNum >= 1 && rawGradeNum <= 2;
      if (!isLowerGrade) {
        selectedVoice = 'zh-CN-YunxiNeural'; // Teen/Adult male mentor
      }
    }

    logger.info(`[TTS] Synthesizing text: "${text.substring(0, 30)}..." with voice ${selectedVoice}`);
    const audioBuffer = await synthesizeSpeech(text, selectedVoice);

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(204).send(); // No content (empty text after cleaning)
    }

    // Gemini TTS returns audio/wav (PCM with WAV header)
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    res.send(audioBuffer);
  } catch (err) {
    logger.error('[TTS] Synthesis API failed:', err);
    res.status(500).json({ error: 'TTS语音合成失败', details: err.message });
  }
});


module.exports = router;
