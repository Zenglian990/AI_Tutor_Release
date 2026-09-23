/**
 * Jev Decision Service
 * Wraps TypeSafe AI's Jev "System One" model for K-9 tutoring logic.
 */

const { TypeSafeClient, Choice, Noul, Score } = require('@typesafe-ai/sdk');
const logger = require('./logger');
const config = require('../config');

class JevDecisionService {
    constructor() {
        this.enabled = process.env.JEV_ENABLED === 'true' || config.jevEnabled === true;
        this.confidenceThreshold = parseFloat(process.env.JEV_CONFIDENCE_THRESHOLD || config.jevConfidenceThreshold || '0.7');
        
        if (this.enabled) {
            this.client = new TypeSafeClient();
        } else {
            this.client = null;
        }

        this.stats = {
            routeQuestion: { count: 0, totalLatency: 0 },
            evaluateRetrievalQuality: { count: 0, totalLatency: 0 },
            selectTeachingStrategy: { count: 0, totalLatency: 0 },
            checkOutputSafety: { count: 0, totalLatency: 0 },
        };
    }

    /**
     * Check if the Jev service is enabled
     * @returns {boolean} True if enabled
     */
    isEnabled() {
        return this.enabled;
    }

    /**
     * Get usage statistics and average latencies for Jev API calls
     * @returns {Object} Statistics object mapping method names to call counts and latencies
     */
    getStats() {
        const result = {};
        for (const [method, stat] of Object.entries(this.stats)) {
            result[method] = {
                count: stat.count,
                avgLatency: stat.count > 0 ? (stat.totalLatency / stat.count).toFixed(2) + 'ms' : '0ms'
            };
        }
        return result;
    }

    _recordStat(method, latency) {
        if (this.stats[method]) {
            this.stats[method].count += 1;
            this.stats[method].totalLatency += latency;
        }
    }

    /**
     * Classify student question intent to route to the optimal processing path
     * @param {string} question - Student question
     * @param {number|string} grade - Grade (will be formatted as 'X年级')
     * @param {string} subject - Subject
     * @returns {Promise<Object>} Routing decision
     */
    async routeQuestion(question, grade, subject) {
        const startTime = Date.now();
        const fallback = { route: 'socratic_guidance', difficulty: 5, needsEncouragement: false, confidence: 0, fallback: true };

        if (!this.isEnabled()) {
            return fallback;
        }

        try {
            const gradeFormatted = String(grade).includes('年级') ? String(grade) : `${grade}年级`;
            
            const state = {
                question,
                grade: gradeFormatted,
                subject,
                context: '中国人教版K-9教材辅导系统'
            };

            const questions = {
                route: new Choice(['factual_recall', 'socratic_guidance', 'calculation_step', 'cross_subject', 'off_topic'], {
                    instructions: '判断学生问题的类型，用于路由到最合适的处理策略。factual_recall=事实记忆类（定义/概念/背诵），socratic_guidance=需要引导式思考的理解题，calculation_step=计算解题类，cross_subject=跨学科综合题，off_topic=与学科教学无关的话题'
                }),
                difficulty: new Score({
                    min: 1,
                    max: 10,
                    instructions: '基于该年级课程标准，评估此问题的难度等级'
                }),
                needs_encouragement: new Noul({
                    instructions: '从问题的措辞和语气判断学生是否可能感到困惑或沮丧，需要给予情感鼓励'
                })
            };

            const response = await this.client.ask(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('routeQuestion', latency);
            logger.info(`[Jev] routeQuestion completed in ${latency}ms`);

            // Handle standard Noul responses which might be boolean or objects with probability
            const needsEnc = response.needs_encouragement && typeof response.needs_encouragement === 'object' 
                ? (response.needs_encouragement.isTrue || response.needs_encouragement.value === true)
                : !!response.needs_encouragement;

            return {
                route: response.route,
                difficulty: response.difficulty,
                needsEncouragement: needsEnc,
                confidence: response.confidence || 1,
                rawResponse: response
            };
        } catch (error) {
            logger.error(`[Jev] Error in routeQuestion: ${error.message}`);
            return fallback;
        }
    }

    /**
     * After LanceDB hybrid search, quickly judge if retrieved chunks are relevant and sufficient
     * @param {string} question - Original student question
     * @param {Array} retrievedChunks - Array of objects with .text property
     * @returns {Promise<Object>} Retrieval evaluation
     */
    async evaluateRetrievalQuality(question, retrievedChunks) {
        const startTime = Date.now();
        const fallback = { isRelevant: true, isSufficient: false, bestChunkIndex: 0, confidence: 0, fallback: true };

        if (!this.isEnabled()) {
            return fallback;
        }

        try {
            const chunksText = (retrievedChunks || []).map(c => c.text).join('\n---\n');
            const chunkCount = (retrievedChunks || []).length;
            
            const state = {
                original_question: question,
                retrieved_content: chunksText,
                chunk_count: chunkCount
            };

            const questions = {
                relevant: new Noul({
                    instructions: '检索到的教材内容是否包含回答学生问题所需的关键知识点？'
                }),
                sufficient: new Noul({
                    instructions: '仅凭已检索到的教材内容是否足以完整、准确地回答此问题？还是需要AI模型补充推理？'
                }),
                best_chunk_index: new Score({
                    min: 0,
                    max: Math.max(0, chunkCount - 1),
                    instructions: '哪个检索片段与学生问题最直接相关？返回其索引编号'
                })
            };

            const response = await this.client.ask(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('evaluateRetrievalQuality', latency);
            logger.info(`[Jev] evaluateRetrievalQuality completed in ${latency}ms`);

            const getProb = (val) => {
                if (typeof val === 'number') return val;
                if (val && typeof val === 'object' && val.probability !== undefined) return val.probability;
                if (val === true || (val && val.value === true)) return 1.0;
                return 0.0;
            };

            const relProb = getProb(response.relevant);
            const suffProb = getProb(response.sufficient);

            return {
                isRelevant: relProb > 0.7,
                isSufficient: suffProb > 0.8,
                bestChunkIndex: Math.round(Number(response.best_chunk_index) || 0),
                confidence: response.confidence || 1
            };
        } catch (error) {
            logger.error(`[Jev] Error in evaluateRetrievalQuality: ${error.message}`);
            return fallback;
        }
    }

    /**
     * Dynamically select the best pedagogical strategy based on grade mental model
     * @param {number|string} grade - Student's grade
     * @param {string} questionType - Type of question
     * @param {Object} studentMemory - Optional recent memory/stats
     * @returns {Promise<Object>} Teaching strategy decision
     */
    async selectTeachingStrategy(grade, questionType, studentMemory) {
        const startTime = Date.now();
        const fallback = { strategy: 'step_by_step_scaffold', hintLevel: 3, confidence: 0, fallback: true };

        if (!this.isEnabled()) {
            return fallback;
        }

        try {
            const mem = studentMemory || {};
            const state = {
                grade,
                question_type: questionType,
                recent_accuracy: mem.recentAccuracy || 'unknown',
                consecutive_errors: mem.consecutiveErrors || 0,
                weak_points: mem.weakPoints || 'none'
            };

            const questions = {
                strategy: new Choice(['visual_decompose', 'scenario_memorize', 'mind_map', 'error_correction_loop', 'dialogue_practice', 'step_by_step_scaffold'], {
                    instructions: '根据学生年级的心智发展阶段和近期学习表现，选择最佳教学策略。低年级(1-3)偏向visual_decompose和scenario_memorize，高年级(7-9)偏向mind_map和error_correction_loop'
                }),
                hint_level: new Score({
                    min: 1,
                    max: 5,
                    instructions: '应该提供多少提示？1=仅给方向性引导，5=接近给出完整答案。连续错误多时应适当提高'
                })
            };

            const response = await this.client.ask(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('selectTeachingStrategy', latency);
            logger.info(`[Jev] selectTeachingStrategy completed in ${latency}ms`);

            return {
                strategy: response.strategy,
                hintLevel: Math.round(Number(response.hint_level) || 3),
                confidence: response.confidence || 1
            };
        } catch (error) {
            logger.error(`[Jev] Error in selectTeachingStrategy: ${error.message}`);
            return fallback;
        }
    }

    /**
     * Post-generation guardrail to verify LLM output safety and pedagogical quality
     * @param {string} generatedResponse - The response generated by LLM
     * @param {number|string} grade - Student's grade
     * @returns {Promise<Object>} Safety and quality check results
     */
    async checkOutputSafety(generatedResponse, grade) {
        const startTime = Date.now();
        const fallback = { safe: true, educationallySound: true, tooDirectAnswer: false, shouldRewrite: false, confidence: 0, fallback: true };

        if (!this.isEnabled()) {
            return fallback;
        }

        try {
            const gradeNum = typeof grade === 'string' ? parseInt(grade.replace(/\D/g, '')) || 1 : (Number(grade) || 1);
            const gradeStr = String(grade).includes('年级') ? String(grade) : `${grade}年级`;
            const textToAnalyze = (generatedResponse || '').substring(0, 2000);

            const state = {
                response_text: textToAnalyze,
                target_audience: `${gradeStr}中小学生`,
                content_length: (generatedResponse || '').length
            };

            const questions = {
                age_appropriate: new Noul({
                    instructions: '回答内容是否完全适合该年龄段的中小学生？无暴力、色情、政治敏感或其他不当内容？'
                }),
                educationally_sound: new Noul({
                    instructions: '回答在教育学和学科知识上是否正确？不会误导学生？'
                }),
                gives_direct_answer: new Noul({
                    instructions: '是否直接给出了最终答案或完整解题过程，而没有引导学生独立思考？'
                })
            };

            const response = await this.client.ask(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('checkOutputSafety', latency);
            logger.info(`[Jev] checkOutputSafety completed in ${latency}ms`);

            const getProb = (val) => {
                if (typeof val === 'number') return val;
                if (val && typeof val === 'object' && val.probability !== undefined) return val.probability;
                if (val === true || (val && val.value === true)) return 1.0;
                return 0.0;
            };

            const ageProb = getProb(response.age_appropriate);
            const edProb = getProb(response.educationally_sound);
            const directProb = getProb(response.gives_direct_answer);

            const safe = ageProb > 0.9;
            const educationallySound = edProb > 0.85;
            const tooDirectAnswer = directProb > 0.7;
            const shouldRewrite = tooDirectAnswer && gradeNum <= 6;

            return {
                safe,
                educationallySound,
                tooDirectAnswer,
                shouldRewrite,
                confidence: response.confidence || 1
            };
        } catch (error) {
            logger.error(`[Jev] Error in checkOutputSafety: ${error.message}`);
            return fallback;
        }
    }
}

module.exports = new JevDecisionService();
