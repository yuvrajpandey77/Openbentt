/**
 * Build A2UI v1.0 messages for agent permission / option prompts.
 * Layout data only — the host renders with trusted @a2ui/react components.
 */
import { basicCatalog } from "@a2ui/web_core/catalogs/basic/v1";

export type A2uiV1Message = {
  version: "1.0";
  createSurface?: { surfaceId: string; catalogId: string };
  updateComponents?: {
    surfaceId: string;
    components: Array<Record<string, unknown>>;
  };
  updateDataModel?: { surfaceId: string; path: string; value: unknown };
  deleteSurface?: { surfaceId: string };
};

function btn(id: string, label: string, actionName: string) {
  const labelId = `${id}-label`;
  return [
    {
      id,
      component: "Button",
      child: labelId,
      action: { event: { name: actionName } },
    },
    { id: labelId, component: "Text", text: label },
  ];
}

/** Permission card: Allow once / Allow for task / Deny */
export function buildPermissionSurfaceMessages(args: {
  surfaceId: string;
  title?: string;
  description: string;
  target?: string;
}): A2uiV1Message[] {
  const { surfaceId, description, target } = args;
  const title = args.title ?? "Agent needs your permission";
  const buttons = [
    ...btn("allow-once", "Allow once", "allow-once"),
    ...btn("allow-task", "Allow for task", "allow-task"),
    ...btn("deny", "Deny", "deny"),
  ];
  const children = ["title", "body", ...(target ? (["target"] as const) : []), "actions", "hint"];
  return [
    {
      version: "1.0",
      createSurface: { surfaceId, catalogId: basicCatalog.id },
    },
    {
      version: "1.0",
      updateComponents: {
        surfaceId,
        components: [
          { id: "root", component: "Card", child: "col" },
          { id: "col", component: "Column", children },
          { id: "title", component: "Text", text: { "@path": "/title" } },
          { id: "body", component: "Text", text: { "@path": "/description" } },
          ...(target
            ? [{ id: "target", component: "Text", text: { "@path": "/target" } }]
            : []),
          { id: "actions", component: "Row", children: ["allow-once", "allow-task", "deny"] },
          ...buttons,
          {
            id: "hint",
            component: "Text",
            text: "Nothing runs until you choose. Allow once is one-shot; Allow for task saves a rule for this run.",
          },
        ],
      },
    },
    {
      version: "1.0",
      updateDataModel: {
        surfaceId,
        path: "/",
        value: {
          title,
          description,
          target: target ? `Target: ${target}` : "",
        },
      },
    },
  ];
}

/** Multi-option question card — one button per option + Submit/Dismiss. */
export function buildQuestionSurfaceMessages(args: {
  surfaceId: string;
  header: string;
  question: string;
  options: Array<{ label: string; description?: string }>;
}): A2uiV1Message[] {
  const { surfaceId, header, question, options } = args;
  const optionIds = options.map((_, i) => `opt-${i}`);
  const optionComponents = options.flatMap((o, i) =>
    btn(`opt-${i}`, o.label, `option:${o.label}`)
  );
  return [
    {
      version: "1.0",
      createSurface: { surfaceId, catalogId: basicCatalog.id },
    },
    {
      version: "1.0",
      updateComponents: {
        surfaceId,
        components: [
          { id: "root", component: "Card", child: "col" },
          {
            id: "col",
            component: "Column",
            children: ["header", "question", "options", "footer"],
          },
          { id: "header", component: "Text", text: { "@path": "/header" } },
          { id: "question", component: "Text", text: { "@path": "/question" } },
          { id: "options", component: "Column", children: optionIds },
          ...optionComponents,
          {
            id: "footer",
            component: "Row",
            children: ["dismiss"],
          },
          ...btn("dismiss", "Dismiss", "dismiss"),
        ],
      },
    },
    {
      version: "1.0",
      updateDataModel: {
        surfaceId,
        path: "/",
        value: { header, question },
      },
    },
  ];
}
