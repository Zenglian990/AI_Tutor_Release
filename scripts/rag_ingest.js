const fs = require('fs');
const path = require('path');
const https = require('https');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const lancedb = require('@lancedb/lancedb');
const { ProxyAgent } = require('undici');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const proxyUrl = process.env.HTTP_PROXY || process.env.PROXY_URL;
const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    ...(proxyAgent ? { httpOptions: { dispatcher: proxyAgent } } : {})
});

const PDF_URL = 'https://raw.githubusercontent.com/TapXWorld/ChinaTextbook/master/%E5%B0%8F%E5%AD%A6/%E6%95%B0%E5%AD%A6/%E4%BA%BA%E6%95%99%E7%89%88/%E4%B9%89%E5%8A%A1%E6%95%99%E8%82%B2%E6%95%99%E7%A7%91%E4%B9%A6%C2%B7%E6%95%B0%E5%AD%A6%E4%B8%89%E5%B9%B4%E7%BA%A7%E4%B8%8B%E5%86%8C.pdf';
const PDF_PATH = path.join(__dirname, '../data/grade_3_math.pdf');
const DB_PATH = path.join(__dirname, '../data/lancedb');

async function downloadPDF(url, dest, redirectCount = 0) {
    if (redirectCount > 5) {
        throw new Error('Too many redirects (limit: 5)');
    }
    console.log(`Downloading PDF from ${url}...`);
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                // handle redirect
                downloadPDF(response.headers.location, dest, redirectCount + 1).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

function chunkText(text, maxChars = 1000) {
    const chunks = [];
    let currentChunk = '';
    const paragraphs = text.split('\n\n');
    
    for (const p of paragraphs) {
        if (currentChunk.length + p.length > maxChars) {
            chunks.push(currentChunk.trim());
            currentChunk = p;
        } else {
            currentChunk += '\n\n' + p;
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks.filter(c => c.length > 50); // Filter out very small chunks
}

async function getEmbeddings(texts) {
    console.log(`Getting embeddings for ${texts.length} chunks...`);
    const results = [];
    for (const text of texts) {
        try {
            const response = await ai.models.embedContent({
                model: 'gemini-embedding-2',
                contents: text,
            });
            results.push(response.embeddings[0].values);
        } catch (e) {
            console.error('Error getting embedding for text:', text.substring(0, 50), e);
            // push dummy to keep alignment or just throw
            throw e;
        }
    }
    return results;
}

async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const confirm = await new Promise(resolve => {
        rl.question('⚠️  警告：运行此脚本将【完全清空并重建】向量数据库(textbooks表)！确定继续吗？(yes/no): ', answer => {
            resolve(answer.trim().toLowerCase());
        });
    });

    rl.close();

    if (confirm !== 'yes') {
        console.log('操作已取消。');
        return;
    }

    try {
        const dataDir = path.join(__dirname, '../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }

        console.log('Using dummy text for Grade 3 Math MVP (Network restriction workaround)...');
        const text = `
三年级下册数学（人教版）重点知识总结：

第一单元：位置与方向
1. 认识东、南、西、北四个方向。早晨起来，面向太阳，前面是东，后面是西，左面是北，右面是南。
2. 认识东北、东南、西北、西南四个方向。
3. 能够用给定的一个方向辨认其余的七个方向，并能用这些词语描述物体所在的方向。

第二单元：除数是一位数的除法
1. 口算除法：整十、整百、整千数除以一位数的口算。
2. 笔算除法：基本的笔算方法，从被除数的高位除起，除到被除数的哪一位，商就写在哪一位上面。
3. 0的除法：0除以任何不是0的数都得0。注意：0不能作除数。

第三单元：复式统计表
能够把两个或多个相关的单式统计表合并成一个复式统计表，并能根据统计表中的数据进行简单的分析。

第四单元：两位数乘两位数
1. 口算乘法：整十、整百数乘整十数。
2. 笔算乘法：先用第二个因数个位上的数去乘第一个因数，得数的末位和因数的个位对齐；再用第二个因数十位上的数去乘第一个因数，得数的末位和因数的十位对齐；最后把两次乘得的积加起来。

第五单元：面积
1. 面积的含义：物体的表面或封闭图形的大小，就是它们的面积。
2. 常用的面积单位：平方厘米、平方分米、平方米。
3. 长方形的面积 = 长 × 宽。正方形的面积 = 边长 × 边长。
4. 面积单位间的进率：1平方米 = 100平方分米，1平方分米 = 100平方厘米。

第六单元：年、月、日
1. 认识时间单位年、月、日。一年有12个月。大月（31天）有：1、3、5、7、8、10、12月；小月（30天）有：4、6、9、11月。
2. 平年与闰年：平年2月有28天，全年365天；闰年2月有29天，全年366天。公历年份是4的倍数的一般是闰年（如2004年），但公历年份是整百数的，必须是400的倍数才是闰年（如2000年是闰年，1900年不是闰年）。
3. 24时计时法：在一日（天）里，钟表上的时针正好走两圈，共24小时。
`;
        
        console.log('Chunking text...');
        const chunks = chunkText(text, 200); // 调小 chunk size 以便展示多条
        console.log(`Created ${chunks.length} chunks.`);

        if (chunks.length === 0) {
            console.error("No text could be extracted.");
            return;
        }

        const vectors = await getEmbeddings(chunks);

        console.log('Connecting to LanceDB...');
        const db = await lancedb.connect(DB_PATH);
        
        const data = chunks.map((text, i) => ({
            id: i,
            vector: vectors[i],
            text: text,
            source: 'grade_3_math_mock.txt'
        }));

        console.log('Creating LanceDB table...');
        try {
            await db.dropTable('textbooks');
        } catch (e) {
            // Table might not exist
        }
        
        const table = await db.createTable('textbooks', data);
        console.log(`Ingested ${data.length} records into LanceDB table 'textbooks'.`);
        console.log('Ingestion complete!');
        
    } catch (e) {
        console.error('Error during ingestion:', e);
    }
}

main();
