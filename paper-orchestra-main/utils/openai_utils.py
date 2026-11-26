# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from typing import Any
import re
import json
import time
import os
import sys
import threading
import cv2  # type: ignore
import base64

from openai import OpenAI  # type: ignore
from dotenv import load_dotenv  # type: ignore

dot_file = os.path.join(os.path.dirname(__file__), "../.env")
load_dotenv(dot_file)

_openai_client = None
_openai_client_lock = threading.Lock()


def get_openai_client() -> OpenAI:
    """Returns a shared OpenAI client, creating it on first use.

    The client is created lazily so that OPENAI_API_KEY is only required when
    an OpenAI model is actually called (e.g. Gemini-only setups don't need it).

    OPENAI_BASE_URL (or OPENBENTT_PROVIDER_BASE_URL) routes calls to OmniRoute /
    OpenAI-compatible local gateways.
    """
    global _openai_client
    if _openai_client is None:
        with _openai_client_lock:
            if _openai_client is None:
                openai_api_key = os.environ.get("OPENAI_API_KEY")
                if not openai_api_key:
                    raise ValueError("OPENAI_API_KEY must be set to use OpenAI models.")
                base_url = (
                    os.environ.get("OPENAI_BASE_URL")
                    or os.environ.get("OPENBENTT_PROVIDER_BASE_URL")
                    or ""
                ).strip() or None
                kwargs = {"api_key": openai_api_key}
                if base_url:
                    kwargs["base_url"] = base_url
                    print(f"Using OpenAI-compatible base URL: {base_url}")
                _openai_client = OpenAI(**kwargs)
    return _openai_client


def parse_openai_json_results(response: str):
    if not response or not isinstance(response, str):
        return None

    json_pattern = r"```json(.*?)```"
    matches = re.findall(json_pattern, response, re.DOTALL)

    if not matches:
        json_pattern = r"(\{.*\}|\[.*\])"
        matches = re.findall(json_pattern, response, re.DOTALL)

    for json_string in matches:
        json_string = json_string.strip()
        try:
            parsed_json = json.loads(json_string)
            return parsed_json
        except json.JSONDecodeError:
            try:
                json_string_clean = re.sub(r"[\x00-\x1F\x7F]", "", json_string)
                json_string_clean = re.sub(r",\s*([\]}])", r"\1", json_string_clean)
                json_string_clean = re.sub(
                    r'\\(?![\\"/bfnrtu])', r"\\\\", json_string_clean
                )

                parsed_json = json.loads(json_string_clean)
                return parsed_json
            except json.JSONDecodeError:
                continue

    try:
        start_idx = response.find("{")
        end_idx = response.rfind("}")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_string = response[start_idx : end_idx + 1]
            json_string_clean = re.sub(r"[\x00-\x1F\x7F]", "", json_string)
            json_string_clean = re.sub(r",\s*([\]}])", r"\1", json_string_clean)
            json_string_clean = re.sub(
                r'\\(?![\\"/bfnrtu])', r"\\\\", json_string_clean
            )
            return json.loads(json_string_clean)
    except Exception:
        pass

    try:
        start_idx = response.find("[")
        end_idx = response.rfind("]")
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_string = response[start_idx : end_idx + 1]
            json_string_clean = re.sub(r"[\x00-\x1F\x7F]", "", json_string)
            json_string_clean = re.sub(r",\s*([\]}])", r"\1", json_string_clean)
            json_string_clean = re.sub(
                r'\\(?![\\"/bfnrtu])', r"\\\\", json_string_clean
            )
            return json.loads(json_string_clean)
    except Exception:
        pass

    return None  # No valid JSON found


class FatalLLMError(RuntimeError):
    """Non-retryable provider failure (budget, auth, permission)."""


# OpenCode free catalog (same as chat). Override with OPENBENTT_PAPER_BRIDGE_MODEL
# or OPENBENTT_PAPER_FREE_MODELS (comma-separated).
_DEFAULT_FREE_MODELS = (
    "opencode/big-pickle",
    "opencode/flint-40b-free",
    "opencode/nemotron-3.5-lightning-free",
    "opencode/mimo-v2.6-flash-free",
    "opencode/beam-free",
    "opencode/hy4-flash-free",
)


def free_model_candidates(preferred: str | None = None) -> list[str]:
    """Ordered free-model list for Paper bridge failover."""
    env_list = (os.environ.get("OPENBENTT_PAPER_FREE_MODELS") or "").strip()
    base = [m.strip() for m in env_list.split(",") if m.strip()] if env_list else list(_DEFAULT_FREE_MODELS)
    out: list[str] = []
    if preferred and preferred.strip():
        out.append(preferred.strip())
    for m in base:
        if m not in out:
            out.append(m)
    return out


def is_model_unavailable_error(exc: BaseException) -> bool:
    """404 / retired :free slug — retrying the same id is useless; try another free model."""
    msg = str(exc or "").lower()
    status = getattr(exc, "status_code", None)
    if status == 404:
        return True
    needles = (
        "unavailable for free",
        "is not a valid model",
        "no endpoints found",
        "model not found",
        "does not exist",
        "error code: 404",
        "not found",
        "paid version is available",
        "use this slug instead",
    )
    return any(n in msg for n in needles)


def is_non_retryable_llm_error(exc: BaseException) -> bool:
    """Budget / auth / hard permission errors never succeed on retry."""
    if is_model_unavailable_error(exc):
        # Handled as model failover, not fatal-by-default.
        return False
    msg = str(exc or "").lower()
    needles = (
        "workspace lifetime budget",
        "budget of $",
        "budget exceeded",
        "insufficient_quota",
        "insufficient quota",
        "does not reset",
        "permissiondenied",
        "permission denied",
        "error code: 403",
        "status code: 403",
        "401",
        "invalid_api_key",
        "incorrect api key",
        "unauthorized",
        "authentication",
        "billing",
        "payment required",
        "402",
    )
    if any(n in msg for n in needles):
        return True
    status = getattr(exc, "status_code", None)
    if status in (401, 402, 403):
        return True
    code = getattr(exc, "code", None)
    if code in ("insufficient_quota", "invalid_api_key"):
        return True
    body = getattr(exc, "body", None)
    if isinstance(body, dict) and body.get("code") in ("insufficient_quota", "invalid_api_key"):
        return True
    return False


def call_openai_models_with_content(
    content: list[Any],
    model_name: str,
    max_retries: int = 5,
    base_interval_sec: int = 5,
    result_parsing_func: callable = parse_openai_json_results,
    generation_configs: dict = {},
    check_parsed_response_not_none: bool = True,
    system_prompt: str = None,
):
    raw_response = None
    parsed_response = None
    openai_client = get_openai_client()
    models = free_model_candidates(model_name)
    # Cap attempts: try each candidate once for unavailable, plus a couple transient retries.
    model_idx = 0
    transient_left = max(2, max_retries - 1)
    attempt = 0

    while model_idx < len(models):
        active_model = models[model_idx]
        attempt += 1
        try:
            messages = []
            if system_prompt:
                role = "developer" if active_model.startswith(("o1", "o3")) else "system"
                messages.append({"role": role, "content": system_prompt})

            messages.append({"role": "user", "content": content})

            if active_model != model_name:
                print(
                    f"OpenAI-compat bridge: trying fallback model={active_model} (was {model_name})",
                    flush=True,
                )

            response = openai_client.chat.completions.create(
                model=active_model,
                messages=messages,
                **generation_configs,
            )
            raw_response = response.choices[0].message.content
            parsed_response = result_parsing_func(raw_response)

            if check_parsed_response_not_none:
                assert (
                    parsed_response is not None
                ), f"Parsed response is None, Here is the raw response:\n{raw_response}"

            if active_model != model_name:
                print(f"OpenAI-compat bridge: using {active_model}", flush=True)

            return {
                "raw_response": raw_response,
                "parsed_response": parsed_response,
            }

        except Exception as e:
            print(
                f"Warning: OpenAI API call (model={active_model}) failed. Error: {e}",
                flush=True,
            )

            if is_non_retryable_llm_error(e):
                hint = (
                    "Provider rejected the call (budget / auth / permission). "
                    "Add a Gemini key in Paper, top up OpenRouter, or set OPENBENTT_PAPER_BRIDGE_MODEL to a working free model."
                )
                print(f"Error: Non-retryable LLM failure — not retrying.\n{hint}", flush=True)
                raise FatalLLMError(f"{hint}\n\n{e}") from e

            if is_model_unavailable_error(e):
                print(
                    f"Model {active_model} unavailable — switching to next free model.",
                    flush=True,
                )
                model_idx += 1
                if model_idx >= len(models):
                    raise FatalLLMError(
                        "No working free OpenRouter model left. "
                        "Add a Gemini API key in Paper, or set OPENBENTT_PAPER_BRIDGE_MODEL / OPENBENTT_PAPER_FREE_MODELS. "
                        f"Last error: {e}"
                    ) from e
                continue

            transient_left -= 1
            if transient_left <= 0:
                # Exhausted transient retries on this model — try next free id.
                model_idx += 1
                transient_left = 2
                if model_idx >= len(models):
                    print("Error: All model candidates failed.", flush=True)
                    raise e
                print(f"Switching to next free model after transient failures…", flush=True)
                continue

            delay = base_interval_sec * (2 ** max(0, attempt - 2))
            delay = min(delay, 20)
            print(f"Retrying {active_model} in {delay} seconds...", flush=True)
            if delay > 0:
                time.sleep(delay)

    print("Error: Exited model failover loop unexpectedly.", flush=True)
    return {
        "raw_response": raw_response,
        "parsed_response": parsed_response,
    }


def call_openai_models_with_text_prompt(
    prompt: str,
    model_name: str,
    result_parsing_func: callable = parse_openai_json_results,
    generation_configs: dict = {},
    check_parsed_response_not_none: bool = True,
    max_retries: int = 5,
    base_interval_sec: int = 5,
    system_prompt: str = None,
):
    return call_openai_models_with_content(
        content=[{"type": "text", "text": prompt}],
        model_name=model_name,
        result_parsing_func=result_parsing_func,
        generation_configs=generation_configs,
        check_parsed_response_not_none=check_parsed_response_not_none,
        max_retries=max_retries,
        base_interval_sec=base_interval_sec,
        system_prompt=system_prompt,
    )


def get_openai_image_part_from_path(image_path: str):
    with open(image_path, "rb") as image_file:
        base64_image = base64.b64encode(image_file.read()).decode("utf-8")

    image_content = [
        {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{base64_image}",
            },
        }
    ]
    return image_content
