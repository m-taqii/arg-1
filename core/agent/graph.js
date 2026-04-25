import { Annotation, END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { modelNode } from "./nodes/modelNode.js";
import { tools } from "./tools/tools.js";

export const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  persona: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  screenshot: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  appContext: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  diffData: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  triggerReason: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  userMessage: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  thinking: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  speechText: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  interruptionScore: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  nextAction: Annotation({
    reducer: (x, y) => y ?? x,
    default: () => "end"
  })
});

// Tool node from centralized registry
const toolNode = new ToolNode(tools);

// In-Memory Session Checkpointer
const checkpointer = new MemorySaver();

// Route: if model returned tool calls → tools, otherwise → end
function shouldContinue(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage?.tool_calls?.length > 0) return "tools";
  return "end";
}

const builder = new StateGraph(AgentState)
  .addNode("model", modelNode)
  .addNode("tools", toolNode)

  .addEdge(START, "model")
  .addConditionalEdges("model", shouldContinue, {
    "tools": "tools",
    "end": END
  })
  .addEdge("tools", "model");

export const agent = builder.compile({ checkpointer });

// Session thread ID — single persistent thread for the entire session
export const SESSION_THREAD = { configurable: { thread_id: "argus-session" } };