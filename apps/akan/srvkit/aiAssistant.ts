import { ChatOpenAI } from "@langchain/openai";
import { Logger } from "akanjs/common";

export class AiAssistant {
  #logger = new Logger("AiAssistant");
  #chatModel: ChatOpenAI;
  constructor(type: "gpt-4o" | "deepseek-reasoner", apiKey: string) {
    if (type === "gpt-4o") process.env.OPENAI_API_KEY = apiKey;
    this.#chatModel = new ChatOpenAI({
      modelName: "gpt-4o",
      //   temperature: 0.7,
      //   maxTokens: 500,
      //   streaming: true, // Enable streaming
      openAIApiKey: type === "gpt-4o" ? apiKey : undefined,
      configuration: {
        baseURL: type === "gpt-4o" ? undefined : "https://api.deepseek.com/v1",
        apiKey: type === "deepseek-reasoner" ? apiKey : undefined,
      },
    });
  }
  async getJsonResponse(prompt: string, files: { url: string }[] = []) {
    try {
      const result = await this.#chatModel.invoke([
        prompt,
        { role: "user", content: files.map((file) => ({ type: "image_url", image_url: { url: file.url } })) },
      ]);
      const jsonString = (result.content as string).replace(/^```json\s*\n|\n```$/g, "");
      const obj = JSON.parse(jsonString) as unknown;
      return obj;
    } catch (err) {
      this.#logger.error(err as string);
      return null;
    }
  }
}
