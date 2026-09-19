/**
 * Phase 9.5B — Structured error normalization.
 * Maps raw provider/runtime errors to standardized error types for consistent UI.
 */

export type NormalizedErrorCode =
  | "MODEL_NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "AUTH_REQUIRED"
  | "AUTH_EXPIRED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "LOCAL_RUNTIME_UNAVAILABLE"
  | "MODEL_LOADING"
  | "MODEL_DOWNLOAD_REQUIRED"
  | "UNKNOWN_PROVIDER_ERROR";

export interface NormalizedError {
  code: NormalizedErrorCode;
  message: string;
  /** Human-readable action the user can take. */
  action: string;
  /** Technical details for advanced/debug view. */
  details?: {
    provider?: string;
    model?: string;
    statusCode?: number;
    rawError?: string;
  };
}

/**
 * Maps HTTP status codes to normalized error codes.
 */
function httpStatusToCode(status: number): NormalizedErrorCode {
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "AUTH_EXPIRED";
  if (status === 404) return "MODEL_NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  return "UNKNOWN_PROVIDER_ERROR";
}

/**
 * Normalizes an error from OpenRouter or OpenAI-compatible providers.
 */
export function normalizeOpenRouterError(
  error: unknown,
  provider: string,
  model: string
): NormalizedError {
  const err = error as { response?: { status: number; data?: { error?: { message?: string } } }; message?: string; cause?: unknown };

  // Network / fetch errors
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return {
      code: "NETWORK_ERROR",
      message: "Unable to reach the provider.",
      action: "Check your internet connection and try again.",
      details: { provider, model, rawError: err.message },
    };
  }

  // HTTP errors from provider
  if (err.response?.status) {
    const code = httpStatusToCode(err.response.status);
    const rawMessage = err.response.data?.error?.message ?? err.message ?? "Provider error";

    switch (code) {
      case "AUTH_REQUIRED":
        return {
          code,
          message: "Authentication required or invalid API key.",
          action: "Check your API key in Settings → Providers.",
          details: { provider, model, statusCode: err.response.status, rawError: rawMessage },
        };
      case "AUTH_EXPIRED":
        return {
          code,
          message: "API key expired or lacks permission.",
          action: "Update your API key in Settings → Providers.",
          details: { provider, model, statusCode: err.response.status, rawError: rawMessage },
        };
      case "MODEL_NOT_FOUND":
        return {
          code,
          message: `Model "${model}" not found or not available.`,
          action: "Select a different model in the model picker.",
          details: { provider, model, statusCode: err.response.status, rawError: rawMessage },
        };
      case "RATE_LIMITED":
        return {
          code,
          message: "Rate limit exceeded. Please wait before sending more requests.",
          action: "Wait a moment and try again, or check your provider quota.",
          details: { provider, model, statusCode: err.response.status, rawError: rawMessage },
        };
      case "PROVIDER_UNAVAILABLE":
        return {
          code,
          message: "The provider is currently unavailable.",
          action: "Try again later or select a different provider.",
          details: { provider, model, statusCode: err.response.status, rawError: rawMessage },
        };
    }
  }

  // Generic error with message
  const message = err.message ?? String(error);
  return {
    code: "UNKNOWN_PROVIDER_ERROR",
    message,
    action: "Try again or select a different model/provider.",
    details: { provider, model, rawError: message },
  };
}

/**
 * Normalizes an error from local Ollama runtime.
 */
export function normalizeOllamaError(
  error: unknown,
  model: string
): NormalizedError {
  const err = error as { response?: { status: number }; message?: string; cause?: unknown };

  // Network / connection errors
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return {
      code: "LOCAL_RUNTIME_UNAVAILABLE",
      message: "Cannot reach Ollama. Is it running?",
      action: "Start Ollama (ollama serve) and ensure it's on http://127.0.0.1:11434.",
      details: { provider: "ollama", model, rawError: err.message },
    };
  }

  if (err.response?.status) {
    const code = httpStatusToCode(err.response.status);
    if (code === "MODEL_NOT_FOUND") {
      return {
        code,
        message: `Model "${model}" not installed in Ollama.`,
        action: "Install the model via Settings → Local AI, or select a different model.",
        details: { provider: "ollama", model, statusCode: err.response.status },
      };
    }
    if (code === "PROVIDER_UNAVAILABLE") {
      return {
        code,
        message: "Ollama returned an error.",
        action: "Check Ollama logs and ensure the model is loaded.",
        details: { provider: "ollama", model, statusCode: err.response.status },
      };
    }
  }

  const message = err.message ?? String(error);
  return {
    code: "UNKNOWN_PROVIDER_ERROR",
    message,
    action: "Check Ollama logs or select a different model.",
    details: { provider: "ollama", model, rawError: message },
  };
}

/**
 * Normalizes an error from on-device WebGPU runtime.
 */
export function normalizeWebGpuError(
  error: unknown,
  model: string
): NormalizedError {
  const err = error as { message?: string; name?: string };

  if (err.name === "AbortError") {
    return {
      code: "MODEL_LOADING",
      message: "Model loading was cancelled.",
      action: "Try sending again — the model may still be loading.",
      details: { provider: "webgpu", model, rawError: err.message },
    };
  }

  if (err.message?.includes("WebGPU") || err.message?.includes("GPU")) {
    return {
      code: "LOCAL_RUNTIME_UNAVAILABLE",
      message: "WebGPU is not available on this device.",
      action: "Enable WebGPU in browser settings, or switch to a cloud provider.",
      details: { provider: "webgpu", model, rawError: err.message },
    };
  }

  if (err.message?.includes("memory") || err.message?.includes("OOM")) {
    return {
      code: "LOCAL_RUNTIME_UNAVAILABLE",
      message: "Not enough memory to run this model.",
      action: "Close other applications or select a smaller model.",
      details: { provider: "webgpu", model, rawError: err.message },
    };
  }

  const message = err.message ?? String(error);
  return {
    code: "UNKNOWN_PROVIDER_ERROR",
    message,
    action: "Try again or select a different model.",
    details: { provider: "webgpu", model, rawError: message },
  };
}

/**
 * Normalizes an error from GGUF/llama.cpp runtime.
 */
export function normalizeGgufError(
  error: unknown,
  model: string
): NormalizedError {
  const err = error as { message?: string; response?: { status: number } };

  if (err.response?.status) {
    const code = httpStatusToCode(err.response.status);
    if (code === "MODEL_NOT_FOUND") {
      return {
        code,
        message: `GGUF model "${model}" not found or not loaded.`,
        action: "Load the model in Settings → Local AI → GGUF, or select a different model.",
        details: { provider: "gguf", model, statusCode: err.response.status },
      };
    }
  }

  const message = err.message ?? String(error);
  return {
    code: "UNKNOWN_PROVIDER_ERROR",
    message,
    action: "Check the llama.cpp server logs or select a different model.",
    details: { provider: "gguf", model, rawError: message },
  };
}

/**
 * Main entry point: normalizes any provider error based on the active provider.
 */
export function normalizeProviderError(
  error: unknown,
  provider: string,
  model: string
): NormalizedError {
  const lowerProvider = provider.toLowerCase();

  if (lowerProvider === "ollama" || lowerProvider === "openai_compatible") {
    // Check if it's a local Ollama URL
    const baseUrl = (error as { config?: { baseURL?: string } })?.config?.baseURL ?? "";
    if (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")) {
      return normalizeOllamaError(error, model);
    }
    return normalizeOpenRouterError(error, provider, model);
  }

  if (lowerProvider === "webgpu_gemma") {
    return normalizeWebGpuError(error, model);
  }

  if (lowerProvider === "local_gguf") {
    return normalizeGgufError(error, model);
  }

  // OpenRouter, OpenAI Direct, Anthropic, Google, etc.
  return normalizeOpenRouterError(error, provider, model);
}

/**
 * User-friendly error messages for each code (used when details are hidden).
 */
export const ERROR_MESSAGES: Record<NormalizedErrorCode, { title: string; description: string }> = {
  MODEL_NOT_FOUND: {
    title: "Model not found",
    description: "The selected model is not available. Please choose a different model.",
  },
  PROVIDER_UNAVAILABLE: {
    title: "Provider unavailable",
    description: "The AI provider is currently unreachable. Try again later.",
  },
  AUTH_REQUIRED: {
    title: "Authentication required",
    description: "Please add a valid API key in Settings → Providers.",
  },
  AUTH_EXPIRED: {
    title: "Authentication expired",
    description: "Your API key has expired or been revoked. Please update it in Settings.",
  },
  RATE_LIMITED: {
    title: "Rate limited",
    description: "Too many requests. Please wait before trying again.",
  },
  NETWORK_ERROR: {
    title: "Network error",
    description: "Unable to connect. Check your internet connection.",
  },
  LOCAL_RUNTIME_UNAVAILABLE: {
    title: "Local AI unavailable",
    description: "The local runtime is not available. Check Ollama or WebGPU status.",
  },
  MODEL_LOADING: {
    title: "Model loading",
    description: "The model is still loading. Please wait a moment.",
  },
  MODEL_DOWNLOAD_REQUIRED: {
    title: "Model not installed",
    description: "This model needs to be downloaded first. Go to Settings → Local AI.",
  },
  UNKNOWN_PROVIDER_ERROR: {
    title: "Error",
    description: "An unexpected error occurred. Please try again.",
  },
};