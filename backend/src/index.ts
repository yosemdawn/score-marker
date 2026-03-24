
import express from 'express';
import multer from 'multer';
import axios from 'axios'; 
import path from 'path';
import fs from 'fs';
import { gradeStudentAnswers } from './grader';

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../frontend')));

// Multer configuration for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Define interface for LLM response
interface LLMResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

interface ParsedLLMResult {
    name: string;
    answers: { [key: string]: string };
    error?: string;
}

// Helper function to call Doubao LLM API
async function callDoubaoLLM(imageBuffer: Buffer, doubaoApiKey: string, doubaoSecretKey: string): Promise<ParsedLLMResult | { error: string }> {
    const base64Image = imageBuffer.toString('base64');
    const prompt = `你是一个智能答题卡识别助手。请从提供的答题卡图片中识别学生信息和作答内容。答题卡可能是以下两种类型：

【类型1 - 涂卡式（OMR/光学标记）】：学生通过填涂选项框（●、■）来作答
【类型2 - 手写式】：学生在空白处手写填入具体答案内容

识别规则：
- 涂卡式：识别被填涂/标记的选项框对应的字母（通常A/B/C/D/E/F中的一个）
- 手写式：识别学生手写的具体文本内容
- 填空题：识别填写的文本（数字、单词、中文等）
- 如果题目既无涂卡标记也无手写内容，视为未作答（空值）

输出格式（JSON，仅输出JSON，不要任何其他文字）：
{
  "name": "学生姓名",
  "answers": {
    "1": "A",
    "2": "B",
    "3": "具体答案文本",
    ...
  }
}

关键要求：
1. 姓名：从图片中识别清晰可见的学生姓名
2. 题号与答案必须严格一一对应
3. 选择题答案通常是单个大写字母（A-F）
4. 填空题答案是具体的文本/数字内容
5. 涂卡：识别被填涂的框，返回对应字母
6. 如无法识别，在error字段说明原因
7. 只输出JSON对象，不要包含任何markdown标记或解释`;

    try {
        const response = await axios.post<LLMResponse>(
            'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            {
                model: 'doubao-seed-2-0-lite-260215',
                max_completion_tokens: 65535,
                reasoning_effort: 'medium',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ],
                    },
                ],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${doubaoApiKey}`,
                    ...(doubaoSecretKey && { 'X-Secret-Key': doubaoSecretKey }),
                },
            }
        );
        const content = response.data.choices[0].message.content;
        
        // 添加详细的调试日志
        console.log('=== LLM 原始返回内容 ===');
        console.log(content);
        console.log('=== 内容长度 ===');
        console.log(content.length);
        console.log('=== 开始解析 ===');
        
        // 尝试多种解析方式
        let parsedResult = null;
        
        // 方式1: 尝试解析 ```json 包装的内容
        const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            console.log('找到 ```json 包装的内容:', jsonMatch[1]);
            try {
                parsedResult = JSON.parse(jsonMatch[1]);
                console.log('成功解析 ```json 包装的内容');
            } catch (e) {
                console.log('解析 ```json 包装的内容失败:', e instanceof Error ? e.message : String(e));
            }
        }
        
        // 方式2: 尝试解析 ``` 包装的内容
        if (!parsedResult) {
            const codeMatch = content.match(/```\s*\n([\s\S]*?)\n\s*```/);
            if (codeMatch && codeMatch[1]) {
                console.log('找到 ``` 包装的内容:', codeMatch[1]);
                try {
                    parsedResult = JSON.parse(codeMatch[1]);
                    console.log('成功解析 ``` 包装的内容');
                } catch (e) {
                    console.log('解析 ``` 包装的内容失败:', e instanceof Error ? e.message : String(e));
                }
            }
        }
        
        // 方式3: 尝试直接解析整个内容
        if (!parsedResult) {
            console.log('尝试直接解析整个内容');
            try {
                parsedResult = JSON.parse(content);
                console.log('成功直接解析整个内容');
            } catch (e) {
                console.log('直接解析整个内容失败:', e instanceof Error ? e.message : String(e));
            }
        }
        
        // 方式4: 尝试提取JSON对象
        if (!parsedResult) {
            const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
            if (jsonObjectMatch) {
                console.log('找到JSON对象:', jsonObjectMatch[0]);
                try {
                    parsedResult = JSON.parse(jsonObjectMatch[0]);
                    console.log('成功解析JSON对象');
                } catch (e) {
                    console.log('解析JSON对象失败:', e instanceof Error ? e.message : String(e));
                }
            }
        }
        
        if (parsedResult) {
            console.log('=== 最终解析结果 ===');
            console.log(JSON.stringify(parsedResult, null, 2));
            return parsedResult;
        } else {
            console.log('=== 所有解析方式都失败了 ===');
            throw new Error(`无法解析LLM返回的内容: ${content.substring(0, 500)}...`);
        }
    } catch (error: unknown) { 
        console.error('Error calling Doubao LLM:', error);
        // Check if it's an AxiosError by duck-typing
        if (typeof error === 'object' && error !== null && 'isAxiosError' in error && (error as any).isAxiosError && 'response' in error) {
            const axiosError = error as any;
            console.error('Doubao LLM API Error Response:', axiosError.response.data);
            return { error: `LLM API Error: ${JSON.stringify(axiosError.response.data)}` };
        }
        if (error instanceof Error) {
            return { error: `LLM调用失败: ${error.message}` };
        }
        return { error: 'LLM调用失败: 未知错误' };
    }
}

// POST /api/process endpoint
app.post('/api/process', upload.array('files'), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    const doubaoApiKey = req.body.doubaoApiKey || process.env.DOUBAO_API_KEY;
    const doubaoSecretKey = req.body.doubaoSecretKey || process.env.DOUBAO_SECRET_KEY;

    if (!doubaoApiKey) {
        return res.status(400).json({ message: 'Doubao API Key is required.' });
    }

    const results = [];
    const standardAnswers = JSON.parse(req.body.standardAnswers || "{}");

    for (const file of files) {
        const filename = file.originalname;
        try {
            const llmResult = await callDoubaoLLM(file.buffer, doubaoApiKey, doubaoSecretKey);
            if (llmResult.error) {
                results.push({ filename, error: llmResult.error });
            } else {
                // 改进的验证逻辑
                const parsedResult = llmResult as ParsedLLMResult;
                
                console.log('=== 验证解析结果 ===');
                console.log('姓名字段:', parsedResult.name);
                console.log('答案字段:', parsedResult.answers);
                console.log('所有字段:', Object.keys(parsedResult));
                
                // 更宽松的验证逻辑
                let name = parsedResult.name || '';
                let answers = parsedResult.answers || {};
                
                // 尝试从其他可能的字段名获取数据
                if (!name) {
                    name = (parsedResult as any).student_name ||
                           (parsedResult as any).studentName ||
                           (parsedResult as any).姓名 ||
                           (parsedResult as any).学生姓名 ||
                           '未识别';
                }
                
                if (!answers || Object.keys(answers).length === 0) {
                    answers = (parsedResult as any).student_answers ||
                             (parsedResult as any).studentAnswers ||
                             (parsedResult as any).答案 ||
                             (parsedResult as any).学生答案 ||
                             {};
                }
                
                console.log('=== 处理后的数据 ===');
                console.log('最终姓名:', name);
                console.log('最终答案:', answers);
                
                // 如果至少有答案数据，就继续处理
                if (Object.keys(answers).length > 0) {
                    const finalResult = { name, answers };
                    const grading = gradeStudentAnswers(finalResult.answers, standardAnswers);
                    results.push({ filename, parsed: finalResult, grading });
                    console.log('成功处理文件:', filename);
                } else {
                    const errorMsg = `LLM返回结果格式不正确。原始内容: ${JSON.stringify(parsedResult)}`;
                    console.log('处理失败:', errorMsg);
                    results.push({ filename, error: errorMsg });
                }
            }
        } catch (error: unknown) {
            console.error(`Error processing file ${filename}:`, error);
            if (error instanceof Error) {
                results.push({ filename, error: `处理文件失败: ${error.message}` });
            } else {
                results.push({ filename, error: '处理文件失败: 未知错误' });
            }
        }
    }
    res.json({ items: results });
});

// POST /api/parse-score-config endpoint
// 调用 LLM 将自然语言分值描述解析为结构化的 scoreMap
app.post('/api/parse-score-config', async (req, res) => {
    const { text, doubaoApiKey, doubaoSecretKey } = req.body;

    if (!text || !text.trim()) {
        return res.status(400).json({ message: '请输入分值描述文本。' });
    }
    if (!doubaoApiKey) {
        return res.status(400).json({ message: '请先在系统配置中设置 API Key。' });
    }

    const prompt = `你是一个考试分值解析助手。用户会用自然语言描述试题的分值分配规则，请将其解析为一个JSON对象，其中key为题号（字符串），value为该题的分值（数字）。

重要规则：
1. 必须将范围展开为每一道题。例如"1-5题每题2分"要展开为 {"1":2,"2":2,"3":2,"4":2,"5":2}
2. 只输出纯JSON对象，不要包含任何解释、注释或markdown格式
3. 题号必须是字符串，分值必须是数字（支持小数如2.5）

示例输入：1到3题每题2分，4到5题每题3.5分
示例输出：{"1":2,"2":2,"3":2,"4":3.5,"5":3.5}

用户输入：${text.trim()}`;

    try {
        const response = await axios.post<LLMResponse>(
            'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            {
                model: 'doubao-seed-2-0-lite-260215',
                reasoning_effort: 'medium',
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${doubaoApiKey}`,
                    ...(doubaoSecretKey && { 'X-Secret-Key': doubaoSecretKey }),
                },
            }
        );

        const content = response.data.choices[0].message.content;
        console.log('=== 分值解析 LLM 原始返回 ===');
        console.log(content);

        // 多种方式尝试解析JSON
        let scoreMap = null;

        // 方式1: ```json 包装
        const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n\s*```/);
        if (jsonMatch && jsonMatch[1]) {
            try { scoreMap = JSON.parse(jsonMatch[1]); } catch (e) {}
        }

        // 方式2: ``` 包装
        if (!scoreMap) {
            const codeMatch = content.match(/```\s*\n([\s\S]*?)\n\s*```/);
            if (codeMatch && codeMatch[1]) {
                try { scoreMap = JSON.parse(codeMatch[1]); } catch (e) {}
            }
        }

        // 方式3: 直接解析
        if (!scoreMap) {
            try { scoreMap = JSON.parse(content); } catch (e) {}
        }

        // 方式4: 提取JSON对象
        if (!scoreMap) {
            const objMatch = content.match(/\{[\s\S]*\}/);
            if (objMatch) {
                try { scoreMap = JSON.parse(objMatch[0]); } catch (e) {}
            }
        }

        if (scoreMap && typeof scoreMap === 'object') {
            // 验证所有 value 都是数字
            const validated: { [key: string]: number } = {};
            for (const key in scoreMap) {
                const val = Number(scoreMap[key]);
                if (!isNaN(val)) {
                    validated[key] = val;
                }
            }
            console.log('=== 解析后的分值配置 ===');
            console.log(JSON.stringify(validated, null, 2));
            res.json({ scoreMap: validated });
        } else {
            res.status(500).json({ message: '无法从LLM返回中解析分值配置，请尝试更清晰的描述。' });
        }
    } catch (error: unknown) {
        console.error('分值解析LLM调用失败:', error);
        if (typeof error === 'object' && error !== null && 'isAxiosError' in error && (error as any).isAxiosError && 'response' in error) {
            const axiosError = error as any;
            return res.status(500).json({ message: `LLM API Error: ${JSON.stringify(axiosError.response.data)}` });
        }
        if (error instanceof Error) {
            return res.status(500).json({ message: `解析失败: ${error.message}` });
        }
        return res.status(500).json({ message: '解析失败: 未知错误' });
    }
});

// POST /api/export endpoint
app.post('/api/export', (req, res) => {
    const gradingResults = req.body.gradingResults;

    if (!gradingResults || !Array.isArray(gradingResults) || gradingResults.length === 0) {
        return res.status(400).json({ message: 'No grading results provided for export.' });
    }

    let csvContent = '\ufeff'; // UTF-8 BOM
    const headers = ['文件名', '学生姓名', '总分'];
    const questionNumbers = new Set<string>();

    // Collect all unique question numbers
    gradingResults.forEach((studentResult: any) => {
        if (studentResult.grading) {
            Object.keys(studentResult.grading).forEach(qNum => questionNumbers.add(qNum));
        }
    });

    const sortedQuestionNumbers = Array.from(questionNumbers).sort((a, b) => {
        // Try to sort numerically if possible, otherwise alphabetically
        const numA = parseInt(a);
        const numB = parseInt(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        return a.localeCompare(b);
    });

    sortedQuestionNumbers.forEach(qNum => {
        headers.push(`题号${qNum}-得分`);
        headers.push(`题号${qNum}-是否正确`);
        headers.push(`题号${qNum}-学生答案`);
        headers.push(`题号${qNum}-标准答案`);
    });

    csvContent += headers.join(',') + '\n';

    gradingResults.forEach((studentResult: any) => {
        if (studentResult.error) {
            csvContent += `${studentResult.filename},"","",${studentResult.error}\n`;
            return;
        }

        const row: (string | number)[] = [];
        row.push(studentResult.filename);
        row.push(studentResult.parsed.name || '');

        let totalScore = 0;
        if (studentResult.grading) {
            for (const qNum in studentResult.grading) {
                totalScore += studentResult.grading[qNum].score;
            }
        }
        row.push(totalScore);

        sortedQuestionNumbers.forEach(qNum => {
            const grade = studentResult.grading ? studentResult.grading[qNum] : undefined;
            row.push(grade ? grade.score : 0);
            row.push(grade ? (grade.isCorrect ? '是' : '否') : '否');
            row.push(grade && grade.studentAnswer ? `"${grade.studentAnswer.replace(/"/g, '""')}"` : '');
            row.push(grade && grade.standardAnswer ? `"${grade.standardAnswer.replace(/"/g, '""')}"` : '');
        });
        csvContent += row.join(',') + '\n';
    });

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('成绩报告.csv');
    res.send(csvContent);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


