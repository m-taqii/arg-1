import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { modelNode } from "./nodes/modelNode.js";

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

const builder = new StateGraph(AgentState)
  .addNode("model", modelNode)

  .addEdge(START, "model")
  .addConditionalEdges("model", (state) => state.nextAction, {
    "agent": "model",
    "end": END
  });
export const agent = builder.compile();