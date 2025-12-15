import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";

interface StreamResponse {
  content: string;
  chunk?: string;
}

export const streamAi = async (
  question: string,
  callback: (chunk: string) => void = (chunk) => {
    process.stdout.write(chunk);
  }
): Promise<StreamResponse> => {
  const createStreamingModel = (apiKey = process.env.DEEPSEEK_API_KEY) => {
    if (!apiKey) throw new Error(`process.env.DEEPSEEK_API_KEY is not set`);
    return new ChatOpenAI({
      modelName: "deepseek-reasoner",
      temperature: 0.7,
      streaming: true, // Enable streaming
      configuration: { baseURL: "https://api.deepseek.com/v1", apiKey },
    });
  };
  const createProcessingChain = () => {
    return RunnableSequence.from([PromptTemplate.fromTemplate(`Answer concisely: {question}`), createStreamingModel()]);
  };
  try {
    const chain = createProcessingChain();
    const stream = await chain.stream({ question });

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.content;
      if (typeof content === "string") {
        fullResponse += content;
        callback(content); // Send individual chunks to callback
      }
    }

    return { content: fullResponse };
  } catch (error) {
    throw new Error("Failed to stream response");
  }
};
