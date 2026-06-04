import { input, select } from "@inquirer/prompts";
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";
import { Logger } from "akanjs/common";
import chalk from "chalk";

import { GlobalConfig } from "./cloud";
import type { Executor, WorkspaceExecutor } from "./executors";
import { Spinner } from "./spinner";
import type { FileContent } from "./types";

const MAX_ASK_TRY = 300;

const deepSeekLlmModels = ["deepseek-chat", "deepseek-reasoner"] as const;

const openAiLlmModels = ["gpt-5.5"] as const;

export const supportedLlmModels = [...deepSeekLlmModels, ...openAiLlmModels] as const;
export type SupportedLlmModel = (typeof supportedLlmModels)[number];
type OpenAiLlmModel = (typeof openAiLlmModels)[number];

const isOpenAiLlmModel = (model: SupportedLlmModel): model is OpenAiLlmModel =>
  openAiLlmModels.includes(model as OpenAiLlmModel);

interface EditOptions {
  onReasoning?: (reasoning: string) => void;
  onChunk?: (chunk: string) => void;
  maxTry?: number;
  validate?: string[];
  approve?: boolean;
  fallbackToPreviousTypescript?: boolean;
}

export const parseTypescriptFileBlocks = (text: string): FileContent[] => {
  const fileBlocks: FileContent[] = [];
  const codeBlockRegex = /```(?:typescript|ts|tsx)\s*\n([\s\S]*?)```/gi;
  const filePathRegex = /^\s*\/\/\s*File:\s*(.+?)\s*$/im;

  for (const codeBlock of text.matchAll(codeBlockRegex)) {
    const content = codeBlock[1]?.trim();
    if (!content) continue;

    const filePath = filePathRegex.exec(content)?.[1]?.trim();
    if (!filePath) continue;

    fileBlocks.push({
      filePath,
      content: content.replace(filePathRegex, "").trim(),
    });
  }

  return fileBlocks;
};

export const preserveTypescriptResponseContent = (previousContent: string, nextContent: string) => {
  const previousWrites = parseTypescriptFileBlocks(previousContent);
  const nextWrites = parseTypescriptFileBlocks(nextContent);
  if (previousWrites.length > 0 && nextWrites.length === 0) return previousContent;
  return nextContent;
};

export class AiSession {
  static #cacheDir = "node_modules/.cache/akan/aiSession";
  static #chat: ChatDeepSeek | ChatOpenAI | null = null;
  static async init({ temperature = 0, useExisting = true }: { temperature?: number; useExisting?: boolean } = {}) {
    if (useExisting) {
      const llmConfig = await AiSession.getLlmConfig();
      if (llmConfig) {
        AiSession.#setChatModel(llmConfig.model, llmConfig.apiKey);
        Logger.rawLog(chalk.dim(`🤖akan editor uses existing LLM config (${llmConfig.model})`));
        return AiSession;
      }
    } else Logger.rawLog(chalk.yellow("🤖akan-editor is not initialized. LLM configuration should be set first."));

    const llmConfig = await AiSession.#requestLlmConfig();
    const { model, apiKey } = llmConfig;

    await AiSession.#validateApiKey(model, apiKey);
    const session = AiSession.#setChatModel(model, apiKey, { temperature });
    await session.setLlmConfig({ model, apiKey });
    return session;
  }
  static #setChatModel(model: SupportedLlmModel, apiKey: string, { temperature = 0 }: { temperature?: number } = {}) {
    AiSession.#chat = AiSession.#createChatModel(model, apiKey, {
      temperature,
      streaming: true,
    });
    return AiSession;
  }
  static #createChatModel(
    model: SupportedLlmModel,
    apiKey: string,
    { temperature = 0, streaming = false }: { temperature?: number; streaming?: boolean } = {},
  ) {
    if (isOpenAiLlmModel(model))
      return new ChatOpenAI({
        modelName: model,
        temperature,
        streaming,
        openAIApiKey: apiKey,
      });
    return new ChatDeepSeek({
      modelName: model,
      temperature,
      streaming,
      apiKey,
    });
  }
  static async getLlmConfig() {
    return await GlobalConfig.getLlmConfig();
  }
  static async setLlmConfig(llmConfig: { model: SupportedLlmModel; apiKey: string } | null) {
    await GlobalConfig.setLlmConfig(llmConfig);
    return AiSession;
  }
  static async #requestLlmConfig() {
    const model = await select<SupportedLlmModel>({
      message: "Select a LLM model",
      choices: supportedLlmModels,
    });
    const apiKey = await input({ message: "Enter your API key" });
    return { model, apiKey };
  }
  static async #validateApiKey(modelName: SupportedLlmModel, apiKey: string) {
    const spinner = new Spinner("Validating LLM API key...", {
      prefix: `🤖akan-editor`,
    }).start();
    const chat = AiSession.#createChatModel(modelName, apiKey);
    try {
      await chat.invoke("Hi, and just say 'ok'");
      spinner.succeed("LLM API key is valid");
      return true;
    } catch (error) {
      spinner.fail(
        chalk.red(
          `LLM API key is invalid. Please check your API key and try again. You can set it again by running "akan set-llm" or reset by running "akan reset-llm"`,
        ),
      );
      throw error;
    }
  }
  static async clearCache(workspaceRoot: string) {
    const cacheDir = `${workspaceRoot}/${AiSession.#cacheDir}`;
    await Bun.$`rm -rf ${cacheDir}`;
  }

  messageHistory: BaseMessage[] = [];
  readonly sessionKey: string;
  isCacheLoaded: boolean = false;
  workspace: WorkspaceExecutor;
  constructor(
    type: string,
    {
      workspace,
      cacheKey,
      isContinued,
    }: {
      workspace: WorkspaceExecutor;
      cacheKey?: string;
      isContinued?: boolean;
    },
  ) {
    this.workspace = workspace;
    this.sessionKey = `${type}${cacheKey ? `-${cacheKey}` : ""}`;
    if (isContinued) this.#cacheLoadPromise = this.#loadCache();
  }
  #cacheLoadPromise: Promise<void> | null = null;
  async #loadCache() {
    const cacheFile = `${AiSession.#cacheDir}/${this.sessionKey}.json`;
    const isCacheExists = await this.workspace.exists(cacheFile);
    if (isCacheExists)
      this.messageHistory = mapStoredMessagesToChatMessages(
        (await this.workspace.readJson(cacheFile)) as StoredMessage[],
      );
    else this.messageHistory = [];
    this.isCacheLoaded = isCacheExists;
  }
  async #saveCache() {
    const cacheFilePath = `${AiSession.#cacheDir}/${this.sessionKey}.json`;
    await this.workspace.writeJson(cacheFilePath, mapChatMessagesToStoredMessages(this.messageHistory));
  }
  async ask(
    question: string,
    {
      onReasoning = (reasoning: string) => {
        Logger.raw(chalk.dim(reasoning));
      },
      onChunk = (chunk: string) => {
        Logger.raw(chunk);
      },
    }: EditOptions = {},
  ): Promise<{ content: string; messageHistory: BaseMessage[] }> {
    if (!AiSession.#chat) await AiSession.init();
    if (this.#cacheLoadPromise) await this.#cacheLoadPromise;

    if (!AiSession.#chat) throw new Error("Failed to initialize the AI session");
    const loader = new Spinner(`${AiSession.#chat.model} is thinking...`, {
      prefix: `🤖akan-editor`,
    }).start();
    try {
      const humanMessage = new HumanMessage(question);
      this.messageHistory.push(humanMessage);
      const stream = await AiSession.#chat.stream(this.messageHistory);
      let reasoningResponse = "",
        fullResponse = "";
      for await (const chunk of stream) {
        if (loader.isSpinning()) loader.succeed(`${AiSession.#chat.model} responded`);

        if (!fullResponse.length) {
          const reasoningContent = (chunk.additional_kwargs as { reasoning_content?: string }).reasoning_content ?? "";
          if (reasoningContent.length) {
            reasoningResponse += reasoningContent;
            onReasoning(reasoningContent);
            continue;
          } else if (chunk.content.length) {
            reasoningResponse += "\n";
            onReasoning(reasoningResponse);
          }
        }

        const content = chunk.content;
        if (typeof content === "string") {
          fullResponse += content;
          onChunk(content); // Send individual chunks to callback
        }
      }
      fullResponse += "\n";
      onChunk("\n");
      this.messageHistory.push(new AIMessage(fullResponse));
      return { content: fullResponse, messageHistory: this.messageHistory };
    } catch {
      loader.fail(`${AiSession.#chat.model} failed to respond`);
      throw new Error("Failed to stream response");
    }
  }
  async edit(
    question: string,
    { onChunk, onReasoning, maxTry = MAX_ASK_TRY, validate, approve, fallbackToPreviousTypescript }: EditOptions = {},
  ) {
    for (let tryCount = 0; tryCount < maxTry; tryCount++) {
      let response = await this.ask(question, { onChunk, onReasoning });
      if (validate?.length && tryCount === 0) {
        const validateQuestion = `Double check if the response meets the requirements and conditions, and follow the instructions. If not, rewrite it.
${validate.map((v) => `- ${v}`).join("\n")}`;
        const validateResponse = await this.ask(validateQuestion, {
          onChunk,
          onReasoning,
        });
        response = {
          ...validateResponse,
          content: fallbackToPreviousTypescript
            ? preserveTypescriptResponseContent(response.content, validateResponse.content)
            : validateResponse.content,
        };
      }
      const isConfirmed = approve
        ? true
        : await select({
            message: "Do you want to edit the response?",
            choices: [
              { name: "✅ Yes, confirm and apply this result", value: true },
              { name: "🔄 No, I want to edit it more", value: false },
            ],
          });
      if (isConfirmed) {
        await this.#saveCache();
        return response.content;
      }
      question = await input({ message: "What do you want to change?" });
      tryCount++;
    }
    throw new Error("Failed to edit");
  }
  async editTypescript(question: string, options: EditOptions = {}) {
    const content = await this.edit(question, options);
    return this.#getTypescriptCode(content);
  }
  #getTypescriptCode(content: string) {
    //! will be deprecated
    const code = /```(typescript|tsx)([\s\S]*?)```/.exec(content);
    // 2번째로 해야 반환되는데 모르겟음 아무튼 일단 이렇게 함.

    return code?.[2] ?? content;
    // return code ? code[1] : content;
  }
  addToolMessgaes(messages: { type: string; content: string }[]) {
    // const toolMessages = messages.map(
    //   (message) => new ToolMessage({ content: message.content, tool_call_id: message.type })
    // );
    const toolMessages = messages.map((message) => new HumanMessage(message.content));
    this.messageHistory.push(...toolMessages);
    return this;
  }
  async writeTypescripts(question: string, executor: Executor, options: EditOptions = {}) {
    const content = await this.edit(question, {
      ...options,
      fallbackToPreviousTypescript: true,
    });
    const writes = this.#getTypescriptCodes(content);
    if (!writes.length)
      throw new Error(
        "No parseable TypeScript file blocks were found in the AI response. Include `// File: <path>` in each code block.",
      );
    for (const write of writes) await executor.writeFile(write.filePath, write.content);
    return await this.#tryFixTypescripts(writes, executor, options);
  }
  async #editTypescripts(question: string, options: EditOptions = {}, fallbackWrites?: FileContent[]) {
    const content = await this.edit(question, {
      ...options,
      fallbackToPreviousTypescript: true,
    });
    const writes = this.#getTypescriptCodes(content);
    if (!writes.length && fallbackWrites?.length) return fallbackWrites;
    if (!writes.length)
      throw new Error(
        "No parseable TypeScript file blocks were found in the AI response. Include `// File: <path>` in each code block.",
      );
    return writes;
  }
  async #tryFixTypescripts(writes: FileContent[], executor: Executor, options: EditOptions = {}) {
    const MAX_EDIT_TRY = 5;
    for (let tryCount = 0; tryCount < MAX_EDIT_TRY; tryCount++) {
      const loader = new Spinner(`Type checking and linting...`, {
        prefix: `🤖akan-editor`,
      }).start();
      const fileChecks = await Promise.all(
        writes.map(async ({ filePath }) => {
          const lintResult = await executor.lint(filePath, { fix: true });
          const typeCheckResult = await executor.typeCheckAsync(filePath);
          const hasTypeErrors = typeCheckResult.fileErrors.length > 0;
          const hasLintErrors = lintResult.errors.length > 0;
          const needFix = hasTypeErrors || hasLintErrors;
          return { filePath, typeCheckResult, lintResult, needFix };
        }),
      );
      const hasAnyFix = fileChecks.some((fileCheck) => fileCheck.needFix);
      if (hasAnyFix) {
        loader.fail("Type checking and linting has some errors, try to fix them");
        fileChecks.forEach((fileCheck) => {
          Logger.rawLog(
            `TypeCheck Result \n${fileCheck.typeCheckResult.message}\nLint Result \n${fileCheck.lintResult.message}`,
          );
          this.addToolMessgaes([
            { type: "typescript", content: fileCheck.typeCheckResult.message },
            { type: "eslint", content: fileCheck.lintResult.message },
          ]);
        });
        writes = await this.#editTypescripts(
          "Fix the typescript and eslint errors",
          {
            ...options,
            validate: undefined,
            approve: true,
          },
          writes,
        );
        for (const write of writes) await executor.writeFile(write.filePath, write.content);
      } else {
        loader.succeed("Type checking and linting has no errors");
        return writes;
      }
    }
    throw new Error("Failed to create scalar");
  }
  #getTypescriptCodes(text: string): FileContent[] {
    return parseTypescriptFileBlocks(text);
  }
  async editMarkdown(request: string, options: EditOptions = {}) {
    const content = await this.edit(request, options);
    return this.#getMarkdownContent(content);
  }
  #getMarkdownContent(text: string) {
    const searchText = "```markdown";
    const firstIndex = text.indexOf("```markdown");
    const lastIndex = text.lastIndexOf("```");
    if (firstIndex === -1) return text;
    else return text.slice(firstIndex + searchText.length, lastIndex).trim();
  }
}
