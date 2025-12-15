import { Logger } from "@akanjs/common";
import { input, select } from "@inquirer/prompts";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";
import chalk from "chalk";
import fs from "fs";

import { getAkanGlobalConfig, setAkanGlobalConfig } from "./auth";
import type { Executor, WorkspaceExecutor } from "./executors";
import { Spinner } from "./spinner";
import type { FileContent } from "./types";

const MAX_ASK_TRY = 300;

export const supportedLlmModels = ["deepseek-chat", "deepseek-reasoner"] as const;
export type SupportedLlmModel = (typeof supportedLlmModels)[number];

interface EditOptions {
  onReasoning?: (reasoning: string) => void;
  onChunk?: (chunk: string) => void;
  maxTry?: number;
  validate?: string[];
  approve?: boolean;
}

export class AiSession {
  static #cacheDir = "node_modules/.cache/akan/aiSession";
  static #chat: ChatDeepSeek | ChatOpenAI | null = null;
  static async init({ temperature = 0, useExisting = true }: { temperature?: number; useExisting?: boolean } = {}) {
    if (useExisting) {
      const llmConfig = this.getLlmConfig();
      if (llmConfig) {
        this.#setChatModel(llmConfig.model, llmConfig.apiKey);
        Logger.rawLog(chalk.dim(`🤖akan editor uses existing LLM config (${llmConfig.model})`));
        return this;
      }
    } else Logger.rawLog(chalk.yellow("🤖akan-editor is not initialized. LLM configuration should be set first."));

    const llmConfig = await this.#requestLlmConfig();
    const { model, apiKey } = llmConfig;

    await this.#validateApiKey(model, apiKey);
    return this.#setChatModel(model, apiKey, { temperature }).setLlmConfig({ model, apiKey });
  }
  static #setChatModel(model: SupportedLlmModel, apiKey: string, { temperature = 0 }: { temperature?: number } = {}) {
    this.#chat = new ChatDeepSeek({
      modelName: model,
      temperature,
      streaming: true,
      apiKey,
      // configuration: { baseURL: "https://api.deepseek.com/v1", apiKey },
    });
    return this;
  }
  static getLlmConfig() {
    const akanConfig = getAkanGlobalConfig();
    return akanConfig.llm ?? null;
  }
  static setLlmConfig(llmConfig: { model: SupportedLlmModel; apiKey: string } | null) {
    const akanConfig = getAkanGlobalConfig();
    akanConfig.llm = llmConfig;
    setAkanGlobalConfig(akanConfig);
    return this;
  }
  static async #requestLlmConfig() {
    const model = await select<SupportedLlmModel>({ message: "Select a LLM model", choices: supportedLlmModels });
    const apiKey = await input({ message: "Enter your API key" });
    return { model, apiKey };
  }
  static async #validateApiKey(modelName: SupportedLlmModel, apiKey: string) {
    const spinner = new Spinner("Validating LLM API key...", { prefix: `🤖akan-editor` }).start();
    const chat = new ChatOpenAI({
      modelName,
      temperature: 0,
      configuration: { baseURL: "https://api.deepseek.com/v1", apiKey },
    });
    try {
      await chat.invoke("Hi, and just say 'ok'");
      spinner.succeed("LLM API key is valid");
      return true;
    } catch (error) {
      spinner.fail(
        chalk.red(
          `LLM API key is invalid. Please check your API key and try again. You can set it again by running "akan set-llm" or reset by running "akan reset-llm"`
        )
      );
      throw error;
    }
  }
  static clearCache(workspaceRoot: string) {
    const cacheDir = `${workspaceRoot}/${this.#cacheDir}`;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  messageHistory: BaseMessage[] = [];
  readonly sessionKey: string;
  isCacheLoaded: boolean = false;
  workspace: WorkspaceExecutor;
  constructor(
    type: string,
    { workspace, cacheKey, isContinued }: { workspace: WorkspaceExecutor; cacheKey?: string; isContinued?: boolean }
  ) {
    this.workspace = workspace;
    this.sessionKey = `${type}${cacheKey ? `-${cacheKey}` : ""}`;
    if (isContinued) this.#loadCache();
  }
  #loadCache() {
    const cacheFile = `${AiSession.#cacheDir}/${this.sessionKey}.json`;
    const isCacheExists = this.workspace.exists(cacheFile);
    if (isCacheExists)
      this.messageHistory = mapStoredMessagesToChatMessages(this.workspace.readJson(cacheFile) as StoredMessage[]);
    else this.messageHistory = [];
    this.isCacheLoaded = isCacheExists;
    return isCacheExists;
  }
  #saveCache() {
    const cacheFilePath = `${AiSession.#cacheDir}/${this.sessionKey}.json`;
    this.workspace.writeJson(cacheFilePath, mapChatMessagesToStoredMessages(this.messageHistory));
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
    }: EditOptions = {}
  ) {
    if (!AiSession.#chat) await AiSession.init();

    if (!AiSession.#chat) throw new Error("Failed to initialize the AI session");
    const loader = new Spinner(`${AiSession.#chat.model} is thinking...`, {
      prefix: `🤖akan-editor`,
    }).start();
    try {
      const humanMessage = new HumanMessage(question);
      this.messageHistory.push(humanMessage);
      const stream = await AiSession.#chat.stream(this.messageHistory);
      let reasoningResponse = "",
        fullResponse = "",
        tokenIdx = 0;
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
        tokenIdx++;
      }
      fullResponse += "\n";
      onChunk("\n");
      this.messageHistory.push(new AIMessage(fullResponse));
      return { content: fullResponse, messageHistory: this.messageHistory };
    } catch (error) {
      loader.fail(`${AiSession.#chat.model} failed to respond`);
      throw new Error("Failed to stream response");
    }
  }
  async edit(question: string, { onChunk, onReasoning, maxTry = MAX_ASK_TRY, validate, approve }: EditOptions = {}) {
    for (let tryCount = 0; tryCount < maxTry; tryCount++) {
      let response = await this.ask(question, { onChunk, onReasoning });
      if (validate?.length && tryCount === 0) {
        const validateQuestion = `Double check if the response meets the requirements and conditions, and follow the instructions. If not, rewrite it.
${validate.map((v) => `- ${v}`).join("\n")}`;
        response = await this.ask(validateQuestion, { onChunk, onReasoning });
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
        this.#saveCache();
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
    return code ? code[2] : content;
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
    const content = await this.edit(question, options);
    const writes = this.#getTypescriptCodes(content);
    for (const write of writes) executor.writeFile(write.filePath, write.content);
    return await this.#tryFixTypescripts(writes, executor, options);
  }
  async #editTypescripts(question: string, options: EditOptions = {}) {
    const content = await this.edit(question, options);
    return this.#getTypescriptCodes(content);
  }
  async #tryFixTypescripts(writes: FileContent[], executor: Executor, options: EditOptions = {}) {
    const MAX_EDIT_TRY = 5;
    for (let tryCount = 0; tryCount < MAX_EDIT_TRY; tryCount++) {
      const loader = new Spinner(`Type checking and linting...`, { prefix: `🤖akan-editor` }).start();
      const fileChecks = await Promise.all(
        writes.map(async ({ filePath }) => {
          const typeCheckResult = executor.typeCheck(filePath);
          const lintResult = await executor.lint(filePath);
          const needFix = !!typeCheckResult.fileErrors.length || !!lintResult.errors.length;
          return { filePath, typeCheckResult, lintResult, needFix };
        })
      );
      const needFix = fileChecks.some((fileCheck) => fileCheck.needFix);
      if (needFix) {
        loader.fail("Type checking and linting has some errors, try to fix them");
        fileChecks.forEach((fileCheck) => {
          Logger.rawLog(
            `TypeCheck Result \n${fileCheck.typeCheckResult.message}\nLint Result \n${fileCheck.lintResult.message}`
          );
          this.addToolMessgaes([
            { type: "typescript", content: fileCheck.typeCheckResult.message },
            { type: "eslint", content: fileCheck.lintResult.message },
          ]);
        });
        writes = await this.#editTypescripts("Fix the typescript and eslint errors", {
          ...options,
          validate: undefined,
          approve: true,
        });
        for (const write of writes) executor.writeFile(write.filePath, write.content);
      } else {
        loader.succeed("Type checking and linting has no errors");
        return writes;
      }
    }
    throw new Error("Failed to create scalar");
  }
  #getTypescriptCodes(text: string): FileContent[] {
    const codes = text.match(/```(typescript|tsx)([\s\S]*?)```/g);
    if (!codes) return [];
    const result = codes.map((code) => {
      const content = /```(typescript|tsx)([\s\S]*?)```/.exec(code)?.[2];
      if (!content) return null;
      const filePath = /\/\/ File: (.*?)(?:\n|$)/.exec(content)?.[1]?.trim();
      if (!filePath) return null;
      const contentWithoutFilepath = content.replace(`// File: ${filePath}\n`, "").trim();
      return { filePath, content: contentWithoutFilepath };
    });
    return result.filter((code) => code !== null);
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
