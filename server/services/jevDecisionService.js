/**
 * Jev Decision Service
 * Wraps TypeSafe AI's Jev "System One" model for K-9 tutoring logic.
 */

const { TypeSafeClient, choice, noul, score } = require('@typesafe-ai/sdk');
const logger = require('./logger');
const config = require('../config');

class JevDecisionService {
    constructor() {
        this.enabled = process.env.JEV_ENABLED === 'true' || config.jevEnabled === true;
        this.confidenceThreshold = parseFloat(process.env.JEV_CONFIDENCE_THRESHOLD || config.jevConfidenceThreshold || '0.7');
        
        if (this.enabled) {
            try {
                this.client = new TypeSafeClient();
            } catch (err) {
                logger.warn('[Jev] TypeSafeClient initialization failed (check TYPESAFE_API_KEY):', err.message);
                this.client = null;
            }
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
        return this.enabled && this.client !== null;
    }

    /**
     * Set a custom client (useful for unit testing and dependency injection)
     * @param {Object} customClient 
     */
    setClient(customClient) {
        this.client = customClient;
        this.enabled = customClient !== null;
    }

    /**
     * Internal helper to execute System One calls across official SDK and mock clients
     */
    async _callSystemOne(state, questions) {
        if (!this.client) {
            throw new Error('TypeSafe client is not initialized');
        }

        if (typeof this.client.systemOne === 'function') {
            const res = await this.client.systemOne({ state, questions });
            return res.answers || res;
        }

        if (typeof this.client.ask === 'function') {
            return await this.client.ask(state, questions);
        }

        throw new Error('TypeSafe client has neither systemOne nor ask method');
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
                route: choice('判断学生问题的类型，用于路由到最合适的处理策略', {
                    factual_recall: '事实记忆类（定义/概念/背诵）',
                    socratic_guidance: '需要引导式思考的理解题',
                    calculation_step: '计算解题类',
                    cross_subject: '跨学科综合题',
                    off_topic: '与学科教学无关的话题'
                }),
                difficulty: score('基于该年级课程标准，评估此问题的难度等级', [
                    '0-未分级', '1-极度简单', '2-基础', '3-容易', '4-中下', '5-中等',
                    '6-中上', '7-较难', '8-困难', '9-拔高压轴', '10-超纲'
                ]),
                needs_encouragement: noul('从问题的措辞和语气判断学生是否可能感到困惑或沮丧，需要给予情感鼓励')
            };

            const answers = await this._callSystemOne(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('routeQuestion', latency);
            logger.info(`[Jev] routeQuestion completed in ${latency}ms`);

            // Extract route
            const routeAns = answers.route;
            const route = typeof routeAns === 'string' ? routeAns : (routeAns?.choice || routeAns?.route || 'socratic_guidance');
            const confidence = typeof routeAns?.confidence === 'number' ? routeAns.confidence : (answers.confidence ?? 1);

            // Extract difficulty
            const diffAns = answers.difficulty;
            const difficulty = typeof diffAns?.score === 'number' ? Math.round(diffAns.score) : (Number(diffAns?.difficulty ?? diffAns) || 5);

            // Extract needs_encouragement (handles boolean, object, or probability)
            const encAns = answers.needs_encouragement;
            let needsEnc = false;
            if (typeof encAns?.noul === 'number') {
                needsEnc = encAns.noul > 0.6;
            } else if (typeof encAns?.probability === 'number') {
                needsEnc = encAns.probability > 0.6;
            } else if (encAns && typeof encAns === 'object') {
                needsEnc = encAns.isTrue === true || encAns.value === true;
            } else {
                needsEnc = encAns === true;
            }

            return {
                route,
                difficulty,
                needsEncouragement: needsEnc,
                confidence,
                rawResponse: answers
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
                relevant: noul('检索到的教材内容是否包含回答学生问题所需的关键知识点？'),
                sufficient: noul('仅凭已检索到的教材内容是否足以完整、准确地回答此问题？还是需要AI模型补充推理？'),
                best_chunk_index: score(
                    '哪个检索片段与学生问题最直接相关？返回其索引编号',
                    chunkCount > 0 
                        ? Array.from({ length: Math.max(2, chunkCount) }, (_, i) => `片段 ${i}`) 
                        : ['片段 0', '片段 1']
                )
            };

            const answers = await this._callSystemOne(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('evaluateRetrievalQuality', latency);
            logger.info(`[Jev] evaluateRetrievalQuality completed in ${latency}ms`);

            const getProb = (val) => {
                if (typeof val === 'number') return val;
                if (typeof val?.noul === 'number') return val.noul;
                if (val && typeof val === 'object' && val.probability !== undefined) return val.probability;
                if (val === true || (val && (val.value === true || val.isTrue === true))) return 1.0;
                return 0.0;
            };

            const relProb = getProb(answers.relevant);
            const suffProb = getProb(answers.sufficient);

            const chunkAns = answers.best_chunk_index;
            const bestChunkIndex = typeof chunkAns?.score === 'number' 
                ? Math.round(chunkAns.score) 
                : (Number(chunkAns?.best_chunk_index ?? chunkAns) || 0);

            const confidence = typeof answers.relevant?.confidence === 'number' 
                ? answers.relevant.confidence 
                : (answers.confidence ?? 1);

            return {
                isRelevant: relProb > 0.7,
                isSufficient: suffProb > 0.8,
                bestChunkIndex,
                confidence
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
                strategy: choice('根据学生年级的心智发展阶段和近期学习表现，选择最佳教学策略', {
                    visual_decompose: '低年级：可视化拆解与实物图像辅助',
                    scenario_memorize: '低年级：趣味场景化记忆与口诀',
                    mind_map: '高年级：思维导图结构化与概念图联结',
                    error_correction_loop: '高年级：错题闭环纠正与辨析',
                    dialogue_practice: '高年级：情景对话与苏格拉底追问',
                    step_by_step_scaffold: '通用：分步脚手架梯级引导'
                }),
                hint_level: score('应该提供多少提示？', [
                    '0-无提示', '1-仅给方向性引导', '2-指出关键考点', '3-分步提示中间思路', '4-给出核心步骤', '5-接近完整解法'
                ])
            };

            const answers = await this._callSystemOne(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('selectTeachingStrategy', latency);
            logger.info(`[Jev] selectTeachingStrategy completed in ${latency}ms`);

            const stratAns = answers.strategy;
            const strategy = typeof stratAns === 'string' ? stratAns : (stratAns?.choice || stratAns?.strategy || 'step_by_step_scaffold');

            const hintAns = answers.hint_level;
            const hintLevel = typeof hintAns?.score === 'number' 
                ? Math.round(hintAns.score) 
                : (Number(hintAns?.hint_level ?? hintAns) || 3);

            const confidence = typeof stratAns?.confidence === 'number' 
                ? stratAns.confidence 
                : (answers.confidence ?? 1);

            return {
                strategy,
                hintLevel,
                confidence
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
                age_appropriate: noul('回答内容是否完全适合该年龄段的中小学生？无暴力、色情、政治敏感或其他不当内容？'),
                educationally_sound: noul('回答在教育学和学科知识上是否正确？不会误导学生？'),
                gives_direct_answer: noul('是否直接给出了最终答案或完整解题过程，而没有引导学生独立思考？')
            };

            const answers = await this._callSystemOne(state, questions);
            
            const latency = Date.now() - startTime;
            this._recordStat('checkOutputSafety', latency);
            logger.info(`[Jev] checkOutputSafety completed in ${latency}ms`);

            const getProb = (val) => {
                if (typeof val === 'number') return val;
                if (typeof val?.noul === 'number') return val.noul;
                if (val && typeof val === 'object' && val.probability !== undefined) return val.probability;
                if (val === true || (val && (val.value === true || val.isTrue === true))) return 1.0;
                return 0.0;
            };

            const ageProb = getProb(answers.age_appropriate);
            const edProb = getProb(answers.educationally_sound);
            const directProb = getProb(answers.gives_direct_answer);

            const safe = ageProb > 0.9;
            const educationallySound = edProb > 0.85;
            const tooDirectAnswer = directProb > 0.7;
            const shouldRewrite = tooDirectAnswer && gradeNum <= 6;

            const confidence = typeof answers.age_appropriate?.confidence === 'number' 
                ? answers.age_appropriate.confidence 
                : (answers.confidence ?? 1);

            return {
                safe,
                educationallySound,
                tooDirectAnswer,
                shouldRewrite,
                confidence
            };
        } catch (error) {
            logger.error(`[Jev] Error in checkOutputSafety: ${error.message}`);
            return fallback;
        }
    }
}

module.exports = new JevDecisionService();
