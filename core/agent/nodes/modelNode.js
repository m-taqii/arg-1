import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildPrompt } from "../../../config/bootstrap.js";
import { tools } from "../tools/tools.js"

const model = new ChatOpenAI({
    modelName: process.env.MODEL_NAME || "meta-llama/llama-4-scout-17b-16e-instruct",
    temperature: 0.2,
    apiKey: process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
    configuration: {
        baseURL: process.env.OPENAI_BASE_URL || "https://api.groq.com/openai/v1",
    }
});

// Bind tools from the centralized registry
const modelWithTools = model.bindTools(tools);

export async function modelNode(state) {
    const systemPrompt = await buildPrompt(state);
    const userPrompt = state.userMessage || "Evaluate current screen state.";

    const response = await modelWithTools.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage({
            content: [
                { type: "text", text: userPrompt },
                {
                    type: "image_url",
                    image_url: {
                        url: state.screenshot?.startsWith?.("data:")
                            ? state.screenshot
                            : `data:image/png;base64,${state.screenshot.toString('base64')}`
                    }
                }
            ]
        })
    ]);

    const content = response.content || "";

    const thinking = content.match?.(/<thinking>([\s\S]*?)<\/thinking>/)?.[1] || "";
    const action = content.match?.(/<speech>([\s\S]*?)<\/speech>/)?.[1] || content;
    const scoreMatch = thinking.match?.(/InterruptionScore:?\s*(\d+)/i);

    return {
        messages: [response],
        thinking: typeof thinking === 'string' ? thinking.trim() : "",
        speechText: typeof action === 'string' ? action.trim() : "",
        interruptionScore: scoreMatch ? parseInt(scoreMatch[1]) : 0,
        nextAction: "end"
    };
}