import { DWClient, type DWClientDownStream, EventAck } from "dingtalk-stream";

// 本地定义 ChannelPlugin 类型
interface ChannelPlugin {
    id: string;
    meta: {
        id: string;
        label: string;
        selectionLabel: string;
        docsPath: string;
        blurb: string;
        aliases: string[];
    };
    capabilities: {
        chatTypes: string[];
        canReply: boolean;
        canEdit: boolean;
        canDelete: boolean;
        supportsImages: boolean;
        supportsFiles: boolean;
        supportsVoice: boolean;
    };
    config: {
        listAccountIds: (cfg: any) => string[];
        resolveAccount: (cfg: any, accountId?: string) => any;
    };
    gateway?: any;
    outbound?: any;
    setup?: any;
    status?: any;
}

interface DingtalkAccountConfig {
    enabled?: boolean;
    clientId: string;
    clientSecret: string;
    robotCode?: string;
}

interface DingtalkConfig {
    accounts?: Record<string, DingtalkAccountConfig>;
}

interface AccessTokenResponse {
    accessToken: string;
    expireIn: number;
}

type MessageFormat = "text" | "markdown";

interface ActionCardOptions {
    title: string;
    text: string;
    buttons?: Array<{ title: string; actionURL: string }>;
    singleTitle?: string;
    singleURL?: string;
    btnOrientation?: "0" | "1";
}

/**
 * 检测文本内容是否包含 Markdown 语法
 */
function detectMessageFormat(text: string): MessageFormat {
    const markdownPatterns = [
        /^#{1,6}\s/m,           // 标题
        /\*\*.+?\*\*/,          // 粗体
        /\[.+?\]\(.+?\)/,       // 链接
        /^\s*[-*]\s/m,          // 无序列表
        /^\s*\d+\.\s/m,         // 有序列表
        /^>/m,                  // 引用
        /```[\s\S]*?```/,       // 代码块
        /`[^`]+`/,              // 行内代码
    ];
    return markdownPatterns.some(p => p.test(text)) ? "markdown" : "text";
}

/**
 * 构建消息体 - 根据内容自动选择格式
 */
function buildMessageBody(content: string, forceFormat?: MessageFormat): object {
    const format = forceFormat || detectMessageFormat(content);

    if (format === "markdown") {
        const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 20);
        return {
            msgtype: "markdown",
            markdown: {
                title: firstLine || "消息",
                text: content,
            },
        };
    }

    return {
        msgtype: "text",
        text: { content },
    };
}

// Token 缓存
const tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const cacheKey = clientId;
    const cached = tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
        return cached.token;
    }

    const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${response.status} ${error}`);
    }

    const data = (await response.json()) as AccessTokenResponse;
    tokenCache.set(cacheKey, {
        token: data.accessToken,
        expiresAt: Date.now() + data.expireIn * 1000,
    });

    return data.accessToken;
}

async function sendGroupMessage(
    accessToken: string,
    openConversationId: string,
    content: string,
    format?: MessageFormat
): Promise<void> {
    const detectedFormat = format || detectMessageFormat(content);
    const isMarkdown = detectedFormat === "markdown";

    const msgKey = isMarkdown ? "sampleMarkdown" : "sampleText";
    const msgParam = isMarkdown
        ? { title: content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 20) || "消息", text: content }
        : { content };

    const response = await fetch("https://api.dingtalk.com/v1.0/robot/groupMessages/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-acs-dingtalk-access-token": accessToken,
        },
        body: JSON.stringify({
            msgParam: JSON.stringify(msgParam),
            msgKey,
            openConversationId,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send message: ${response.status} ${error}`);
    }
}

async function sendPrivateMessage(
    accessToken: string,
    robotCode: string,
    userId: string,
    content: string,
    format?: MessageFormat
): Promise<void> {
    const detectedFormat = format || detectMessageFormat(content);
    const isMarkdown = detectedFormat === "markdown";

    const msgKey = isMarkdown ? "sampleMarkdown" : "sampleText";
    const msgParam = isMarkdown
        ? { title: content.split('\n')[0].replace(/^#+\s*/, '').slice(0, 20) || "消息", text: content }
        : { content };

    const response = await fetch("https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-acs-dingtalk-access-token": accessToken,
        },
        body: JSON.stringify({
            robotCode,
            userIds: [userId],
            msgKey,
            msgParam: JSON.stringify(msgParam),
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send private message: ${response.status} ${error}`);
    }
}

async function sendGroupActionCard(
    accessToken: string,
    openConversationId: string,
    options: ActionCardOptions
): Promise<void> {
    const hasBtns = options.buttons && options.buttons.length > 0;
    const msgKey = hasBtns ? "sampleActionCard2" : "sampleActionCard";

    const msgParam: Record<string, unknown> = {
        title: options.title,
        text: options.text,
    };

    if (hasBtns) {
        msgParam.actionTitle1 = options.buttons![0].title;
        msgParam.actionUrl1 = options.buttons![0].actionURL;
        if (options.buttons!.length > 1) {
            msgParam.actionTitle2 = options.buttons![1].title;
            msgParam.actionUrl2 = options.buttons![1].actionURL;
        }
    } else {
        msgParam.singleTitle = options.singleTitle || "查看详情";
        msgParam.singleUrl = options.singleURL || "";
    }

    const response = await fetch("https://api.dingtalk.com/v1.0/robot/groupMessages/send", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-acs-dingtalk-access-token": accessToken,
        },
        body: JSON.stringify({
            msgParam: JSON.stringify(msgParam),
            msgKey,
            openConversationId,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to send action card: ${response.status} ${error}`);
    }
}

// Stream 客户端管理
const streamClients: Map<string, DWClient> = new Map();

// 消息去重缓存
const processedMessages: Map<string, number> = new Map();
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function cleanupOldMessageIds() {
    const now = Date.now();
    for (const [msgId, timestamp] of processedMessages) {
        if (now - timestamp > DEDUP_WINDOW_MS) {
            processedMessages.delete(msgId);
        }
    }
}

function isDuplicateMessage(msgId: string): boolean {
    cleanupOldMessageIds();
    if (processedMessages.has(msgId)) {
        return true;
    }
    processedMessages.set(msgId, Date.now());
    return false;
}

const dingtalkPlugin: ChannelPlugin = {
    id: "dingtalk",
    meta: {
        id: "dingtalk",
        label: "钉钉机器人",
        selectionLabel: "钉钉机器人 (Dingtalk)",
        docsPath: "/channels/dingtalk",
        blurb: "通过钉钉 Stream SDK 接收和发送消息",
        aliases: ["dt", "dingding"],
    },
    capabilities: {
        chatTypes: ["group", "dm"],
        canReply: true,
        canEdit: false,
        canDelete: false,
        supportsImages: false,
        supportsFiles: false,
        supportsVoice: false,
    },
    config: {
        listAccountIds: (cfg) => {
            const config = cfg.channels?.dingtalk as DingtalkConfig | undefined;
            if (!config?.accounts) return [];
            return Object.entries(config.accounts)
                .filter(([, acc]) => acc.enabled !== false)
                .map(([id]) => id);
        },
        resolveAccount: (cfg, accountId = "default") => {
            const config = cfg.channels?.dingtalk as DingtalkConfig | undefined;
            const account = config?.accounts?.[accountId];
            if (!account) return { accountId };
            return {
                accountId,
                enabled: account.enabled !== false,
                configured: Boolean(account.clientId && account.clientSecret),
            };
        },
    },
    gateway: {
        startAccount: async (ctx) => {
            const { account, log, cfg } = ctx;
            const accountId = account.accountId;

            const channelConfig = (cfg as any).channels?.dingtalk as DingtalkConfig | undefined;
            const config = channelConfig?.accounts?.[accountId];

            if (!config?.clientId || !config?.clientSecret) {
                log?.error(`[dingtalk:${accountId}] Missing credentials.`);
                throw new Error(`Account ${accountId}: missing clientId or clientSecret`);
            }

            log?.info(`[dingtalk:${accountId}] Starting Stream connection...`);

            const client = new DWClient({
                clientId: config.clientId,
                clientSecret: config.clientSecret,
            });

            client.on("connect", () => log?.info(`[dingtalk:${accountId}] Stream connected`));
            client.on("disconnect", () => log?.info(`[dingtalk:${accountId}] Stream disconnected`));
            client.on("error", (error: Error) => log?.error(`[dingtalk:${accountId}] Stream error: ${error.message}`));

            client.registerCallbackListener(
                "/v1.0/im/bot/messages/get",
                async (message: DWClientDownStream) => {
                    (async () => {
                        try {
                            const data = JSON.parse(message.data);
                            const dedupId = data.msgId || `${data.conversationId}-${data.createAt}-${data.senderStaffId}`;

                            if (isDuplicateMessage(dedupId)) return;

                            const textContent = data.text?.content?.trim();
                            if (data.msgtype !== "text" || !textContent) return;

                            const sessionKey = `dingtalk:${accountId}:${data.conversationId}`;
                            const chatType = data.conversationType === "2" ? "group" : "direct";

                            // 修复：使用更具通用性的导入方式，尝试从 openclaw 包导入
                            let dispatcher: any;
                            try {
                                // 尝试从 openclaw 导入，使用 any 绕过 TS 检查
                                const module = await import("openclaw/dist/auto-reply/reply/provider-dispatcher.js" as any);
                                dispatcher = module.dispatchReplyWithBufferedBlockDispatcher;
                            } catch (e) {
                                log?.warn(`[dingtalk:${accountId}] Failed to import from 'openclaw', trying common paths...`);
                                // 尝试一些常见的 OpenClaw 安装路径
                                const paths = [
                                    "/usr/local/lib/node_modules/openclaw/dist/auto-reply/reply/provider-dispatcher.js",
                                    process.env.OPENCLAW_PATH ? `${process.env.OPENCLAW_PATH}/dist/auto-reply/reply/provider-dispatcher.js` : null
                                ].filter(Boolean);

                                for (const p of paths) {
                                    try {
                                        const module = await import(p!);
                                        dispatcher = module.dispatchReplyWithBufferedBlockDispatcher;
                                        if (dispatcher) break;
                                    } catch (innerE) { }
                                }
                            }

                            if (!dispatcher) {
                                log?.error(`[dingtalk:${accountId}] Could not find OpenClaw dispatcher. Please ensure OpenClaw is installed.`);
                                return;
                            }

                            const msgContext = {
                                Body: textContent,
                                BodyForAgent: textContent,
                                CommandBody: textContent,
                                BodyForCommands: textContent,
                                From: data.senderStaffId,
                                SessionKey: sessionKey,
                                AccountId: accountId,
                                SenderName: data.senderNick,
                                SenderId: data.senderStaffId,
                                ChatType: chatType,
                                Provider: "dingtalk",
                                Surface: "dingtalk",
                                OriginatingChannel: "dingtalk" as const,
                                OriginatingTo: data.conversationId,
                                Timestamp: data.createAt,
                                CommandAuthorized: true,
                            };

                            const webhook = data.sessionWebhook;

                            await dispatcher({
                                ctx: msgContext,
                                cfg,
                                dispatcherOptions: {
                                    deliver: async (payload: { text?: string }) => {
                                        if (payload.text && webhook) {
                                            try {
                                                const messageBody = buildMessageBody(payload.text);
                                                await fetch(webhook, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify(messageBody),
                                                });
                                            } catch (err) {
                                                log?.error(`[dingtalk:${accountId}] Error sending reply: ${err}`);
                                            }
                                        }
                                    },
                                },
                            });
                        } catch (error) {
                            log?.error(`[dingtalk:${accountId}] Failed to process message: ${error}`);
                        }
                    })();

                    return EventAck.SUCCESS;
                }
            );

            client.connect();
            streamClients.set(accountId, client);
            return { ok: true };
        },
        stopAccount: async (ctx: any) => {
            const { account, log } = ctx;
            const accountId = account.accountId;
            const client = streamClients.get(accountId);
            if (client) {
                await client.disconnect();
                streamClients.delete(accountId);
            }
            return { ok: true };
        },
    },
    outbound: {
        sendText: async ({ text, config: msgConfig, incoming }) => {
            const accountId = msgConfig.accountId ?? "default";
            const cfg = msgConfig.cfg as { channels?: { dingtalk?: DingtalkConfig } };
            const account = cfg.channels?.dingtalk?.accounts?.[accountId];

            if (!account || !account.clientId || !account.clientSecret) {
                return { ok: false, error: "Account config missing" };
            }

            try {
                const accessToken = await getAccessToken(account.clientId, account.clientSecret);
                if (incoming?.raw) {
                    const { conversationId, conversationType, senderStaffId } = incoming.raw as any;
                    if (conversationType === "2") {
                        await sendGroupMessage(accessToken, conversationId, text);
                    } else {
                        if (!account.robotCode) return { ok: false, error: "Missing robotCode" };
                        await sendPrivateMessage(accessToken, account.robotCode, senderStaffId, text);
                    }
                } else {
                    return { ok: false, error: "No context" };
                }
                return { ok: true };
            } catch (error) {
                return { ok: false, error: String(error) };
            }
        },
    },
    setup: {
        run: async ({ prompter }) => {
            const clientId = await prompter.text("请输入钉钉机器人 ClientId (AppKey):");
            const clientSecret = await prompter.secret("请输入钉钉机器人 ClientSecret (AppSecret):");
            const robotCode = await prompter.text("请输入机器人编码 (robotCode，可选):");

            return {
                config: {
                    accounts: {
                        default: {
                            enabled: true,
                            clientId,
                            clientSecret,
                            robotCode: robotCode || undefined,
                        },
                    },
                },
            };
        },
    },
    status: {
        check: async ({ account }) => {
            const client = streamClients.get(account.accountId);
            return client ? { ok: true, message: "Running" } : { ok: false, message: "Stopped" };
        },
    },
};

// OpenClaw v2 标准导出：导出 plugin 对象
export const plugin = dingtalkPlugin;

// 同时也提供默认导出以保持兼容性
export default function register(api: any) {
    api.registerChannel({ plugin: dingtalkPlugin });
}

export {
    detectMessageFormat,
    buildMessageBody,
    type MessageFormat,
    type ActionCardOptions,
};
