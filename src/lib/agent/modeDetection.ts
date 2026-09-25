import { classifyTask, decideMode, shouldRouteToOpenCode } from "@/lib/agent/openCodeEvents";
import type { ExecutionMode } from "@/context/ChatContext";
import type { Message } from "@/types/chat";

export type ModeIntent = {
  recommendedMode: ExecutionMode;
  confidence: "low" | "medium" | "high";
  reason: string;
  requiresProjectContext: boolean;
  requiresExecution: boolean;
  requiresUserApproval: boolean;
};

export interface ModeSuggestion {
  mode: ExecutionMode;
  confidence: "low" | "medium" | "high";
  reason: string;
}

/**
 * Internal detection context — passed from the caller to provide
 * conversation/project/execution awareness without leaking internals to UI.
 */
export interface DetectionContext {
  /** Recent conversation messages (up to last 8 turns) */
  conversationHistory?: Array<{ role: string; content: string }>;
  /** Active project/workspace root path */
  projectRoot?: string | null;
  /** Current user-selected execution mode */
  currentMode?: ExecutionMode;
  /** Whether an execution task is currently running in this conversation */
  isTaskRunning?: boolean;
  /** Current task status if running */
  currentTaskStatus?: string | null;
  /** Whether the user has attached files/code references */
  hasAttachments?: boolean;
}

/**
 * Analyze the request and context to determine user intent.
 * This replaces pure keyword scoring with semantic analysis of:
 * - The actual request
 * - Conversation history
 * - Project context
 * - File/code references
 * - Execution state
 */
export function detectModeIntent(
  text: string,
  context: DetectionContext = {}
): ModeIntent {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      recommendedMode: "chat",
      confidence: "high",
      reason: "Empty input defaults to chat",
      requiresProjectContext: false,
      requiresExecution: false,
      requiresUserApproval: false,
    };
  }

  const lower = trimmed.toLowerCase();
  const hasProjectContext = !!context.projectRoot;

  // Check for explicit mode override in current selection
  const explicitMode = context.currentMode ?? "chat";
  const isExplicitlySet = explicitMode !== "chat";

  // If user explicitly selected a non-chat mode, respect it
  if (isExplicitlySet) {
    return {
      recommendedMode: explicitMode,
      confidence: "high",
      reason: `User explicitly selected ${explicitMode} mode`,
      requiresProjectContext: explicitMode !== "chat",
      requiresExecution: explicitMode !== "chat",
      requiresUserApproval: explicitMode === "build" || explicitMode === "task",
    };
  }

  // If a task is already running, don't re-classify — let it continue
  if (context.isTaskRunning && context.currentTaskStatus) {
    return {
      recommendedMode: "task",
      confidence: "high",
      reason: `Continuing active task (${context.currentTaskStatus})`,
      requiresProjectContext: true,
      requiresExecution: true,
      requiresUserApproval: true,
    };
  }

  // Use OpenCode's deterministic classifier as a baseline
  const category = classifyTask(trimmed);
  const routeToOpenCode = shouldRouteToOpenCode(category);
  const openCodeMode = decideMode(trimmed);

  // Semantic intent analysis beyond keywords
  const intent = analyzeIntent(trimmed, context);

  // CRITICAL: Strong informational signals should override classifier
  // These are clearly non-executing requests despite containing action words
  const isStronglyInformational = 
    intent.isExplanation ||
    (intent.isQuestion && (lower.includes("how") || lower.includes("what") || lower.includes("why"))) ||
    intent.isInformational;

  // Check if action verbs appear in a HOW/WHAT/WHY question context
  // e.g., "how to fix", "can you create", "what is the best way to implement"
  // These are questions ABOUT the action, not requests TO do the action
  const actionVerbInQuestionContext = 
    (intent.isQuestion || lower.startsWith("how") || lower.startsWith("what") || lower.startsWith("why")) &&
    (intent.hasExplicitActionVerb || intent.isExplicitlyBuilding) &&
    !/\b(please|go ahead|do it|implement it|build it|fix it|run it|make it|create it)\b/i.test(trimmed);

  // If strongly informational OR action verb is in question context, and not explicitly asking for execution, stay in chat
  if ((isStronglyInformational || actionVerbInQuestionContext) && !intent.isExplicitlyMultiStep) {
    // Check for explicit execution intent that overrides the informational nature
    const hasExplicitExecutionIntent = 
      /\b(please|go ahead|do it|implement it|build it|fix it|run it|make it|create it)\b/i.test(trimmed);

    if (!hasExplicitExecutionIntent) {
      return {
        recommendedMode: "chat",
        confidence: intent.isExplanation ? "high" : "medium",
        reason: intent.isExplanation ? "Explanation request" : "Informational/question request",
        requiresProjectContext: false,
        requiresExecution: false,
        requiresUserApproval: false,
      };
    }
  }

  // Combine classifier result with semantic intent
  let recommendedMode: ExecutionMode = "chat";
  let confidence: "low" | "medium" | "high" = "low";
  let reason = "";
  let requiresExecution = false;
  let requiresApproval = false;

  if (routeToOpenCode) {
    // OpenCode classifier says this is execution-worthy
    requiresExecution = true;
    requiresApproval = openCodeMode === "build";

    if (openCodeMode === "build") {
      // Check if this is actually a multi-step task
      if (intent.isMultiStep || intent.isIterative) {
        recommendedMode = "task";
        reason = "Multi-step implementation with iterative verification";
        confidence = intent.isExplicitlyMultiStep ? "high" : "medium";
      } else {
        recommendedMode = "build";
        reason = `Implementation request detected (${category})`;
        confidence = intent.hasExplicitActionVerb ? "high" : "medium";
      }
    } else {
      // Plan mode
      recommendedMode = "plan";
      reason = `Analysis/planning request detected (${category})`;
      confidence = intent.isExplicitlyPlanning ? "high" : "medium";
    }
  } else {
    // Not routed to OpenCode by classifier — use semantic intent
    if (intent.isMultiStep || intent.isIterative) {
      recommendedMode = "task";
      reason = "Multi-step autonomous work requested";
      confidence = intent.isExplicitlyMultiStep ? "medium" : "low";
      requiresExecution = true;
      requiresApproval = true;
    } else if (intent.isExplicitlyPlanning || intent.isAnalysis) {
      recommendedMode = "plan";
      reason = "Planning/analysis intent detected";
      confidence = intent.isExplicitlyPlanning ? "medium" : "low";
      requiresExecution = true;
      requiresApproval = false;
    } else if (intent.isExplicitlyBuilding) {
      recommendedMode = "build";
      reason = "Implementation intent detected";
      confidence = intent.hasExplicitActionVerb ? "medium" : "low";
      requiresExecution = true;
      requiresApproval = true;
    } else if (intent.isQuestion || intent.isExplanation) {
      recommendedMode = "chat";
      reason = intent.isExplanation ? "Explanation request" : "Question/clarification";
      confidence = "high";
    } else if (intent.isInformational) {
      recommendedMode = "chat";
      reason = "Informational request";
      confidence = "high";
    } else {
      // Ambiguous — default to chat
      recommendedMode = "chat";
      reason = "Conversational or ambiguous request";
      confidence = "low";
    }
  }

  // Project context boosts confidence for execution modes
  if (hasProjectContext && (recommendedMode === "plan" || recommendedMode === "build" || recommendedMode === "task")) {
    if (confidence === "low") confidence = "medium";
    else if (confidence === "medium") confidence = "high";
  }

  // Attachments (files/code) boost execution confidence
  if (context.hasAttachments && (recommendedMode === "build" || recommendedMode === "task")) {
    if (confidence === "low") confidence = "medium";
  }

  // Conversation context: if previous turn was planning, "do it" = build
  const conversationBoost = analyzeConversationContext(context.conversationHistory ?? []);
  if (conversationBoost && recommendedMode === "chat") {
    recommendedMode = conversationBoost;
    reason = `Context suggests ${conversationBoost} (previous: planning)`;
    confidence = "medium";
    requiresExecution = true;
    requiresApproval = conversationBoost !== "plan";
  }

  return {
    recommendedMode,
    confidence,
    reason,
    requiresProjectContext: hasProjectContext && recommendedMode !== "chat",
    requiresExecution,
    requiresUserApproval: requiresApproval,
  };
}

/**
 * Semantic intent analysis — looks at linguistic patterns beyond keywords
 */
function analyzeIntent(text: string, context: DetectionContext): {
  isMultiStep: boolean;
  isIterative: boolean;
  isExplicitlyMultiStep: boolean;
  isExplicitlyPlanning: boolean;
  isExplicitlyBuilding: boolean;
  isAnalysis: boolean;
  isQuestion: boolean;
  isExplanation: boolean;
  isInformational: boolean;
  hasExplicitActionVerb: boolean;
} {
  const lower = text.toLowerCase();

  // Multi-step / iterative patterns
  const multiStepPatterns = [
    /work through/i,
    /fix all/i,
    /resolve all/i,
    /complete all/i,
    /complete the/i,
    /\bcomplete\b.*(authentication|implementation|system|feature|project|refactor)/i,
    /continue until/i,
    /keep working/i,
    /iterate/i,
    /loop/i,
    /pipeline/i,
    /workflow/i,
    /end.?to.?end/i,
    /full implementation/i,
    /entire/i,
    /systematic/i,
    /autonomous/i,
    /step.?by.?step/i,
  ];
  const isMultiStep = multiStepPatterns.some((p) => p.test(text));
  const isExplicitlyMultiStep = /\b(work through|fix all|resolve all|continue until|keep working|iterate)\b/i.test(text);
  const isIterative = /(until (it works|passes|fixed)|keep (going|working)|then (verify|test|check))/i.test(text);

  // Explicit planning language
  const planningPatterns = [
    /\bplan (how|for|to)\b/i,
    /\bhow should (we|i)\b/i,
    /\bwhat (would|should) (we|i)\b/i,
    /\barchitecture\b/i,
    /\bdesign\b/i,
    /\bapproach\b/i,
    /\bstrategy\b/i,
    /\broadmap\b/i,
    /\bpropose\b/i,
    /\brecommend\b/i,
    /\binvestigate\b/i,
    /\bdiagnose\b/i,
  ];
  const isExplicitlyPlanning = planningPatterns.some((p) => p.test(text));

  // Explicit building language
  const buildPatterns = [
    /\b(implement|create|add|write|build|make|generate)\b/i,
    /\b(fix|patch|refactor|modify|edit|update|change)\b/i,
    /\b(delete|remove|rename|migrate)\b/i,
  ];
  const isExplicitlyBuilding = buildPatterns.some((p) => p.test(text));
  const hasExplicitActionVerb = /\b(implement|create|add|write|build|make|generate|fix|patch|refactor|modify|edit|update|change|delete|remove)\b/i.test(text);

  // Analysis patterns
  const analysisPatterns = [
    /\b(analyze|review|assess|evaluate)\b/i,
    /\bfigure out\b/i,
    /\bunderstand\b/i,
    /\bwhy (is|does|did)\b/i,
    /\bwhat (is|are|causes)\b/i,
  ];
  const isAnalysis = analysisPatterns.some((p) => p.test(text));

  // Question patterns
  const isQuestion = /^\s*(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does)\b/i.test(text) && text.includes("?");

  // Explanation patterns
  const isExplanation = /\b(explain|describe|tell me about|what is|what are|how does|meaning of)\b/i.test(text);

  // Informational (non-executing)
  const informationalPatterns = [
    /\b(best practice|pattern|example|tutorial|guide|learn|understand)\b/i,
    /\bhow (do|to|can) (i|we|you)\b/i,
  ];
  const isInformational = informationalPatterns.some((p) => p.test(text));

  return {
    isMultiStep,
    isIterative,
    isExplicitlyMultiStep,
    isExplicitlyPlanning,
    isExplicitlyBuilding,
    isAnalysis,
    isQuestion,
    isExplanation,
    isInformational,
    hasExplicitActionVerb,
  };
}

/**
 * Analyze conversation history for contextual intent
 * Returns the mode that context suggests, or null if no clear signal
 */
function analyzeConversationContext(
  history: Array<{ role: string; content: string }>
): ExecutionMode | null {
  // Look at last few assistant messages for planning/analysis signals
  const recentAssistant = history
    .filter((m) => m.role === "assistant")
    .slice(-3)
    .map((m) => m.content.toLowerCase());

  if (recentAssistant.length === 0) return null;

  // If assistant was planning/analyzing, user saying "do it" or "go ahead" = build
  const lastAssistant = recentAssistant[recentAssistant.length - 1];
  const planningSignals = [
    "plan", "analyze", "investigate", "review", "architecture", "design",
    "approach", "strategy", "propose", "recommend", "should we", "would be",
    "implementation plan", "step 1", "step 2", "first", "then",
  ];

  const wasPlanning = planningSignals.some((s) => lastAssistant.includes(s));

  if (wasPlanning) {
    // The user's follow-up to planning is likely execution
    return "build";
  }

  return null;
}

/**
 * Convert internal ModeIntent to UI-facing ModeSuggestion
 */
export function modeIntentToSuggestion(intent: ModeIntent): ModeSuggestion {
  return {
    mode: intent.recommendedMode,
    confidence: intent.confidence,
    reason: intent.reason,
  };
}

/**
 * Determine if a mode change should be suggested to the user.
 * Only suggests when:
 * - User is in chat mode (default)
 * - Confidence is medium or high
 * - Recommended mode differs from current
 * - Not a trivial/conversational request
 */
export function shouldSuggestModeChange(
  currentMode: ExecutionMode,
  intent: ModeIntent,
  explicitModeSelected: boolean = false
): boolean {
  // Never suggest if user explicitly set the mode
  if (explicitModeSelected && currentMode !== "chat") return false;

  // Never suggest if already in the recommended mode
  if (currentMode === intent.recommendedMode) return false;

  // Never suggest for low confidence
  if (intent.confidence === "low") return false;

  // Don't suggest for chat recommendations (that's the default)
  if (intent.recommendedMode === "chat") return false;

  // Suggest when in chat mode with medium+ confidence
  if (currentMode === "chat" && (intent.confidence === "medium" || intent.confidence === "high")) {
    return true;
  }

  // For non-chat modes, only suggest on high confidence
  return intent.confidence === "high";
}

/**
 * Check if the current request is a conversational follow-up to an active task
 * rather than a new user message that should be classified independently.
 */
export function isInternalTaskStep(
  text: string,
  context: DetectionContext
): boolean {
  // If a task is running, short follow-ups like "continue", "yes", "ok" are internal
  if (context.isTaskRunning) {
    const lower = text.toLowerCase().trim();
    const internalPatterns = [
      /^(yes|yeah|yep|ok|okay|sure|continue|proceed|go ahead|do it)$/i,
      /^continue/i,
      /^proceed/i,
      /^next/i,
    ];
    if (internalPatterns.some((p) => p.test(lower))) return true;
  }
  return false;
}