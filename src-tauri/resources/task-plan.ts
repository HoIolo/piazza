import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "piazza_update_plan",
    label: "待办清单",
    description: "Replace the visible task checklist. Use for multi-step work and update it as progress changes. Skip it for simple requests.",
    parameters: Type.Object({
      todos: Type.Array(Type.Object({
        text: Type.String({ minLength: 1 }),
        status: Type.Union([
          Type.Literal("pending"),
          Type.Literal("in_progress"),
          Type.Literal("completed"),
        ]),
      }), { maxItems: 20 }),
    }),
    async execute(_toolCallId, { todos }) {
      return {
        content: [{ type: "text", text: todos.map(({ text, status }) => `[${status}] ${text}`).join("\n") || "Checklist cleared." }],
        details: { todos },
      };
    },
  });
}
