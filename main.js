const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let cachedToken = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: path.join(__dirname, 'assets', 'icon.ico')
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
    }
}

app.whenReady().then(createWindow);

// ============================================
// 工具函数
// ============================================
function getOpenClawConfigPath() {
    try {
        const result = execSync('openclaw config file', { encoding: 'utf-8' }).trim();
        if (result && fs.existsSync(result)) return result;
    } catch (e) {}
    return path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

function getOpenClawConfig() {
    const configPath = getOpenClawConfigPath();
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveOpenClawConfig(config) {
    const configPath = getOpenClawConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const APP_CONFIG_PATH = path.join(os.homedir(), '.ceciliobot', 'config.json');

function getAppConfig() {
    const dir = path.dirname(APP_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(APP_CONFIG_PATH)) {
        const defaultConfig = {
            roles: {
                researcher: {
                    name: '日常Agent',
                    systemPrompt: '你是一个生活管家，擅长分析人们的日常生活和提炼生活规律，制定学习计划，饮食习惯，以及时间管理。',
                    model: 'qwen/qwen3.5-plus'
                },
                writer: {
                    name: 'IA-Agent',
                    systemPrompt: '你是专业报告撰写专家，擅长把分析结果写成清晰报告。尤其擅长IB这门国际课程的IA报告书写，你可以总结数据与课题内容，规划报告结构，详细描述实验，数据分析的过程，作出完美的但是低ai率的IA报告',
                    model: 'qwen/qwen3.5-plus'
                }
            },
            workflows: {},
            memories: {},
            sessions: {}
        };
        fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf-8'));
}

function saveAppConfig(config) {
    const dir = path.dirname(APP_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ============================================
// Agent 执行（使用 --message-file，彻底避免转义）
// ============================================
function injectMemories(roleId, prompt) {
    try {
        const config = getAppConfig();
        const memories = config.memories?.[roleId] || { facts: [], experiences: [], skills: [] };
        const all = [
            ...memories.facts.map(m => `[事实] ${m.content}`),
            ...memories.experiences.map(m => `[经历] ${m.content}`),
            ...memories.skills.map(m => `[技能] ${m.content}`)
        ];
        if (all.length === 0) return prompt;
        return `【相关记忆】\n${all.join('\n')}\n\n---\n\n${prompt}`;
    } catch (e) { return prompt; }
}

function runAgent(agentId, message) {
    return new Promise((resolve, reject) => {
        const enhanced = injectMemories(agentId, message);
        if (!enhanced || enhanced.trim().length === 0) {
            reject(new Error('消息为空，请检查输入'));
            return;
        }

        // 写入临时文件
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `ceciliobot_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
        try {
            fs.writeFileSync(tmpFile, enhanced, 'utf-8');
        } catch (e) {
            reject(new Error('写入临时文件失败: ' + e.message));
            return;
        }

        const args = ['agent', '--agent', agentId, '--message-file', tmpFile];
        const child = spawn('openclaw', args, { shell: true });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => { stdout += data; });
        child.stderr.on('data', (data) => { stderr += data; });

        child.on('close', (code) => {
            // 清理临时文件
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            if (code !== 0) {
                reject(new Error(stderr || `退出码 ${code}`));
            } else {
                resolve(stdout.trim());
            }
        });
        child.on('error', (err) => {
            try { fs.unlinkSync(tmpFile); } catch (e) {}
            reject(err);
        });
    });
}

// ============================================
// 智能调度（保留原有功能）
// ============================================
ipcMain.handle('smart-schedule', async (event, { goal }) => {
    try {
        const config = getAppConfig();
        const roles = config.roles || {};
        if (Object.keys(roles).length === 0) {
            return { success: false, error: '请先创建角色' };
        }

        const roleList = Object.entries(roles).map(([id, r]) =>
            `- ${id}: ${r.name} - ${r.systemPrompt.substring(0, 60)}...`
        ).join('\n');

        const schedulePrompt = `
你是工作流调度专家。用户目标：${goal}

可用角色：
${roleList}

将目标拆解为 2-5 个步骤，JSON 数组格式，每个元素包含 roleId 和 prompt。
只输出 JSON，不要其他内容。
示例：[{"roleId":"researcher","prompt":"分析 {input} 的数据..."}]
`;

        const schedulerId = Object.keys(roles)[0];

        // 写入调度提示词到临时文件
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `ceciliobot_sched_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
        try {
            fs.writeFileSync(tmpFile, schedulePrompt, 'utf-8');
        } catch (e) {
            return { success: false, error: '写入临时调度文件失败: ' + e.message };
        }

        const args = ['agent', '--agent', schedulerId, '--message-file', tmpFile];
        const output = await new Promise((resolve, reject) => {
            const child = spawn('openclaw', args, { shell: true });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', (data) => { stdout += data; });
            child.stderr.on('data', (data) => { stderr += data; });
            child.on('close', (code) => {
                try { fs.unlinkSync(tmpFile); } catch (e) {}
                if (code !== 0) {
                    reject(new Error(stderr || `退出码 ${code}`));
                } else {
                    resolve(stdout.trim());
                }
            });
            child.on('error', (err) => {
                try { fs.unlinkSync(tmpFile); } catch (e) {}
                reject(err);
            });
        });

        const jsonMatch = output.match(/\[[\s\S]*\]/);
        let steps = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(output);

        if (!Array.isArray(steps) || steps.length === 0) {
            return { success: false, error: '调度结果无效' };
        }

        // 执行步骤
        const results = {};
        let finalOutput = '';
        const stepLabels = [];

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const stepId = `step_${i + 1}`;
            let prompt = step.prompt;
            prompt = prompt.replace(/\{input\}/g, goal);
            for (let j = 1; j <= i; j++) {
                const key = `step_${j}`;
                if (results[key]) {
                    prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), results[key]);
                }
            }

            const label = `${roles[step.roleId]?.name || step.roleId}正在执行...`;
            stepLabels.push(label);
            event.sender.send('chat-progress', `正在调用 ${label}`);

            const output = await runAgent(step.roleId, prompt);
            results[stepId] = output;
            finalOutput = output;
            event.sender.send('chat-progress', `✔ ${label} 完成`);
        }

        // 保存报告
        const outputDir = path.join(os.homedir(), 'ceciliobot', 'outputs');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const reportPath = path.join(outputDir, `报告_${timestamp}.md`);
        fs.writeFileSync(reportPath, `# 执行报告\n\n${finalOutput}`);

        return {
            success: true,
            steps: stepLabels,
            finalOutput,
            reportPath
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ============================================
// 🆕 角色管理（增删改）
// ============================================
ipcMain.handle('get-roles', async () => {
    try {
        const config = getAppConfig();
        return { success: true, roles: config.roles || {} };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('save-role', async (event, { id, role }) => {
    try {
        const config = getAppConfig();
        if (!config.roles) config.roles = {};
        config.roles[id] = role;
        saveAppConfig(config);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-role', async (event, id) => {
    try {
        const config = getAppConfig();
        if (config.roles && config.roles[id]) {
            delete config.roles[id];
            saveAppConfig(config);
            return { success: true };
        }
        return { success: false, error: '角色不存在' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ============================================
// 🆕 手动选择角色顺序执行
// ============================================
ipcMain.handle('run-selected-agents', async (event, { goal, roleIds }) => {
    try {
        const config = getAppConfig();
        const roles = config.roles || {};
        if (roleIds.length === 0) {
            return { success: false, error: '未选择任何角色' };
        }
        // 检查角色是否存在
        for (const id of roleIds) {
            if (!roles[id]) {
                return { success: false, error: `角色 "${id}" 不存在` };
            }
        }

        let finalOutput = '';
        const stepLabels = [];
        let input = goal;

        for (let i = 0; i < roleIds.length; i++) {
            const id = roleIds[i];
            const role = roles[id];
            const label = `${role.name || id}正在执行...`;
            stepLabels.push(label);
            event.sender.send('chat-progress', `正在调用 ${label}`);

            // 构造提示词
            let prompt = (i === 0) 
                ? `任务：${goal}` 
                : `基于上一阶段结果继续处理：\n${input}`;

            // 附加角色系统提示词
            prompt = `${role.systemPrompt}\n\n---\n\n${prompt}`;

            const output = await runAgent(id, prompt);
            input = output;
            finalOutput = output;
            event.sender.send('chat-progress', `✔ ${label} 完成`);
        }

        // 保存报告
        const outputDir = path.join(os.homedir(), 'ceciliobot', 'outputs');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const reportPath = path.join(outputDir, `报告_${timestamp}.md`);
        fs.writeFileSync(reportPath, `# 执行报告\n\n${finalOutput || '无输出'}`);

        return {
            success: true,
            steps: stepLabels,
            finalOutput: finalOutput || '无输出',
            reportPath
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ============================================
// 🆕 模型管理（获取模型列表）
// ============================================
ipcMain.handle('get-models', async () => {
    try {
        const config = getOpenClawConfig();
        if (!config) return { success: false, error: '框架配置缺失' };
        const models = [];
        const providers = config.models?.providers || {};
        for (const [providerId, provider] of Object.entries(providers)) {
            for (const model of (provider.models || [])) {
                models.push({
                    id: `${providerId}/${model.id}`,
                    provider: providerId,
                    modelId: model.id,
                    name: model.name || model.id,
                });
            }
        }
        return { success: true, models, providers };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ============================================
// 🆕 模型管理（添加提供商）
// ============================================
ipcMain.handle('add-provider', async (event, { name, apiKey, baseUrl, modelIds }) => {
    try {
        const config = getOpenClawConfig();
        if (!config) return { success: false, error: '框架配置缺失' };
        if (!config.models) config.models = { mode: 'merge', providers: {} };
        if (!config.models.providers) config.models.providers = {};
        if (config.models.providers[name]) {
            return { success: false, error: `提供商 "${name}" 已存在` };
        }
        config.models.providers[name] = {
            baseUrl: baseUrl || `https://api.${name}.com/v1`,
            api: 'openai-completions',
            models: modelIds.split(',').map(id => ({
                id: id.trim(),
                name: id.trim(),
                reasoning: false,
                input: ['text'],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 128000,
                maxTokens: 4096
            }))
        };
        if (!config.auth) config.auth = { profiles: {} };
        if (!config.auth.profiles) config.auth.profiles = {};
        config.auth.profiles[`${name}:default`] = {
            provider: name,
            mode: 'api_key',
            apiKey: apiKey
        };
        saveOpenClawConfig(config);
        // 重启 Gateway 使配置生效
        try {
            await execPromise('openclaw gateway restart');
        } catch (e) {}
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ============================================
// 🆕 模型管理（删除提供商）
// ============================================
ipcMain.handle('remove-provider', async (event, name) => {
    try {
        if (name === 'qwen') return { success: false, error: '默认提供商不可删除' };
        const config = getOpenClawConfig();
        if (!config) return { success: false, error: '框架配置缺失' };
        if (config.models?.providers?.[name]) {
            delete config.models.providers[name];
            if (config.auth?.profiles?.[`${name}:default`]) {
                delete config.auth.profiles[`${name}:default`];
            }
            saveOpenClawConfig(config);
            try {
                await execPromise('openclaw gateway restart');
            } catch (e) {}
            return { success: true };
        }
        return { success: false, error: '提供商不存在' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 辅助 execPromise（如果已存在则跳过）
function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout);
        });
    });
}

// ============================================
// IPC：框架状态 & Token
// ============================================
ipcMain.handle('check-framework', async () => {
    try {
        const configPath = getOpenClawConfigPath();
        const installed = fs.existsSync(configPath);
        return { installed, version: installed ? 'detected' : null };
    } catch (e) {
        return { installed: false };
    }
});

ipcMain.handle('install-framework', async (event) => {
    const platform = os.platform();
    const command = platform === 'win32' ?
        `powershell -Command "& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard"` :
        `curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard`;

    return new Promise((resolve, reject) => {
        event.sender.send('install-progress', '正在安装核心框架...');
        const child = exec(command, (error, stdout, stderr) => {
            if (error) reject({ success: false, error: stderr || error.message });
            else resolve({ success: true });
        });
        const steps = ['正在配置环境...', '正在下载核心组件...', '正在完成安装...'];
        let idx = 0;
        const timer = setInterval(() => {
            if (idx < steps.length) {
                event.sender.send('install-progress', steps[idx++]);
            } else {
                clearInterval(timer);
            }
        }, 3000);
        child.on('exit', () => clearInterval(timer));
    });
});

ipcMain.handle('set-token', async (event, token) => {
    try {
        cachedToken = token;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-token', async () => {
    try {
        if (cachedToken) return { success: true, token: cachedToken };
        const config = getOpenClawConfig();
        if (!config) return { success: false };
        const token = config.gateway?.auth?.token;
        if (token) cachedToken = token;
        return token ? { success: true, token } : { success: false };
    } catch (e) {
        return { success: false };
    }
});

ipcMain.handle('get-initial-state', async () => {
    try {
        const configPath = getOpenClawConfigPath();
        const frameworkInstalled = fs.existsSync(configPath);
        
        let token = null;
        if (frameworkInstalled) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                token = config?.gateway?.auth?.token || null;
                if (token) cachedToken = token;
            } catch (e) {}
        }
        
        const appConfig = getAppConfig();
        return {
            success: true,
            frameworkInstalled: frameworkInstalled,
            frameworkVersion: frameworkInstalled ? 'detected' : null,
            hasToken: !!token,
            roles: appConfig.roles || {}
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});