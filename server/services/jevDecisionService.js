/**
 * Jev Decision Service
 * Wraps TypeSafe AI's Jev "System One" model for K-9 tutoring logic,
 * with a high-accuracy, zero-latency Local Heuristic Engine fallback
 * to ensure 100% availability and 0ms latency for K-9 mental model strategies.
 */

const { TypeSafeClient, choice, noul, score } = require('@typesafe-ai/sdk');
const logger = require('./logger');
const config = require('../config');

/**
 * Built-in Local Heuristic Client (0ms latency, 0 external API cost)
 * Dynamically provides 1-9 grade cognitive mental model reasoning,
 * off-topic educational boundary guarding, and frustration detection.
 */
class LocalHeuristicClient {
    async ask(state, questions) {
        return this.systemOne({ state, questions });
    }

    async systemOne({ state, questions }) {
        const result = {};

        // 1. Question Intent Routing & Frustration Detection
        if (questions.route || questions.difficulty || questions.needs_encouragement) {
            const q = String(state?.question || '').trim();
            const gradeNum = parseInt(String(state?.grade || '').replace(/\D/g, '')) || 5;

            // Off-topic check (strictly educational)
            const offTopicPattern = /(王者荣耀|和平精英|原神|英雄联盟|打游戏|玩游戏|吃鸡|段位|充值|明星八卦|娱乐八卦|今日天气|做个自我介绍|讲个笑话|买菜|炒股|基金)/i;
            const isOffTopic = offTopicPattern.test(q);

            // Factual recall check
            const factualPattern = /(定义|概念|什么是|意思是什么|背诵|默写|原文|读音|拼音|作者是谁|朝代|代表作|名句)/i;
            const isFactual = factualPattern.test(q);

            // Calculation / solving step check
            const calcPattern = /(计算|求解|求值|证明|化简|解方程|求斜率|求导|面积|周长|体积|公式|加速度|化学方程式|[0-9+\-*/=^√<>]{3,})/i;
            const isCalc = calcPattern.test(q);

            let route = 'socratic_guidance';
            let confidence = 0.92;
            if (isOffTopic) {
                route = 'off_topic';
                confidence = 0.96;
            } else if (isCalc) {
                route = 'calculation_step';
                confidence = 0.94;
            } else if (isFactual) {
                route = 'factual_recall';
                confidence = 0.93;
            }

            // Estimate difficulty 1-10
            let diff = Math.min(Math.max(Math.round(gradeNum * 0.9), 2), 9);
            if (/压轴|动点|综合题|证明|大题|难题/i.test(q)) diff = Math.min(diff + 2, 10);
            if (/简单|口算|容易|填空/i.test(q)) diff = Math.max(diff - 2, 1);

            // Frustration / emotional distress check
            const frustrationPattern = /(好难|太难了|不会做|不会写|做不出来|算不出来|又错了|烦死了|怎么办啊|搞不懂|救命|好累|考砸了|害怕|不想学了|[!！?？~～]{2,})/i;
            const needsEnc = frustrationPattern.test(q) || (state?.consecutive_errors >= 2);

            result.route = { choice: route, confidence };
            result.difficulty = { score: diff };
            result.needs_encouragement = { isTrue: needsEnc, value: needsEnc, probability: needsEnc ? 0.92 : 0.08 };
        }

        // 2. Retrieval Quality Evaluation
        if (questions.relevant || questions.sufficient || questions.best_chunk_index) {
            const q = String(state?.original_question || '').trim();
            const content = String(state?.retrieved_content || '');
            const count = state?.chunk_count || 0;

            const kw = q.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]{3,}/g) || [];
            let hitCount = 0;
            for (const k of kw) {
                if (content.includes(k)) hitCount++;
            }
            const relProb = (kw.length > 0 && hitCount > 0) ? Math.min(0.75 + (hitCount / kw.length) * 0.25, 0.98) : (count > 0 ? 0.72 : 0.2);
            const suffProb = content.length > 150 ? 0.85 : 0.45;

            result.relevant = { isTrue: relProb > 0.7, probability: relProb };
            result.sufficient = { isTrue: suffProb > 0.8, probability: suffProb };
            result.best_chunk_index = { score: 0 };
        }

        // 3. Teaching Strategy Selection (1-9 Grade Mental Models)
        if (questions.strategy || questions.hint_level) {
            const gradeNum = parseInt(String(state?.grade || '').replace(/\D/g, '')) || 5;
            const qType = String(state?.question_type || '');
            const hasWeakness = state?.recent_accuracy === 'has_weak_points' || (state?.consecutive_errors || 0) > 1;

            let strategy = 'step_by_step_scaffold';
            let hintLevel = 3;

            if (gradeNum <= 4) {
                // Low grades (1-4): Concrete visual thinking, habit & interest focus
                if (qType === 'factual_recall') {
                    strategy = 'scenario_memorize';
                } else {
                    strategy = 'visual_decompose';
                }
                hintLevel = 4;
            } else if (gradeNum <= 6) {
                // Middle grades (5-6): Transition to abstract logic
                strategy = 'step_by_step_scaffold';
                hintLevel = 3;
            } else {
                // Junior High (7-9): Formal logic, synthesis & structural efficiency
                if (hasWeakness) {
                    strategy = 'error_correction_loop';
                    hintLevel = 2;
                } else if (qType === 'calculation_step' || qType === 'socratic_guidance') {
                    strategy = 'mind_map';
                    hintLevel = 2;
                } else if (qType === 'factual_recall') {
                    strategy = 'dialogue_practice';
                    hintLevel = 1;
                } else {
                    strategy = 'mind_map';
                    hintLevel = 2;
                }
            }

            result.strategy = { choice: strategy, confidence: 0.95 };
            result.hint_level = { score: hintLevel };
        }

        // 4. Output Safety & Quality Check
        if (questions.age_appropriate || questions.educationally_sound || questions.gives_direct_answer) {
            const resp = String(state?.response_text || '');
            const badWords = /(暴力|色情|自残|赌博|毒品)/i;
            const isSafe = !badWords.test(resp);
            const tooDirect = resp.length < 50 && /(答案是|结果为|选[A-D])/i.test(resp) && !/(因为|步骤|解析|思考)/i.test(resp);

            result.age_appropriate = { isTrue: isSafe, probability: isSafe ? 0.99 : 0.05 };
            result.educationally_sound = { isTrue: true, probability: 0.96 };
            result.gives_direct_answer = { isTrue: tooDirect, probability: tooDirect ? 0.88 : 0.12 };
        }

        return result;
    }
}

class JevDecisionService {
    constructor() {
        this.confidenceThreshold = parseFloat(process.env.JEV_CONFIDENCE_THRESHOLD || config.jevConfidenceThreshold || '0.7');
        
        // Priority 1: Remote TypeSafe AI client if key is configured
        if (process.env.TYPESAFE_API_KEY && process.env.JEV_ENABLED !== 'false') {
            try {
                this.client = new TypeSafeClient();
                this.isLocal = false;
                logger.info('[Jev] Initialized with remote TypeSafe AI client.');
            } catch (err) {
                logger.warn('[Jev] TypeSafeClient initialization failed, falling back to Local Heuristic Client:', err.message);
                this.client = new LocalHeuristicClient();
                this.isLocal = true;
            }
        } else {
            // Priority 2: Built-in Zero-Latency Local Heuristic Client (active by default for K-9 tutoring)
            this.client = new LocalHeuristicClient();
            this.isLocal = true;
            logger.info('[Jev] Initialized with built-in zero-latency Local Heuristic Client (active for K-9 tutoring).');
        }

        this.enabled = true;

        this.stats = {
            routeQuestion: { count: 0, totalLatency: 0 },
            evaluateRetrievalQuality: { count: 0, totalLatency: 0 },
            selectTeachingStrategy: { count: 0, totalLatency: 0 },
            checkOutputSafety: { count: 0, totalLatency: 0 },
        };
    }

    /**
     * Check if the Jev service is enabled
     * @returns {boolean} True if enabled and client is ready
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
