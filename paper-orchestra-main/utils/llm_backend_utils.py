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

import json
import os
from typing import Optional, Callable, Dict, Any

from google.genai import types

from utils.gemini_utils import (
    call_gemini_with_text_prompt,
    parse_gemini_json_results,
    call_gemini_with_contents,
    call_gemini_with_images,
)
from utils.openai_utils import (
    call_openai_models_with_text_prompt,
    call_openai_models_with_content,
    parse_openai_json_results,
    get_openai_image_part_from_path,
)
from utils.pdf_utils import load_paper


def identity_parse(response: str):
    return response


def use_openai_compat_bridge() -> bool:
    """OpenCode / OmniRoute path: force OpenAI-compatible client for all models."""
    flag = (os.environ.get("OPENBENTT_PAPER_LLM_BRIDGE") or "").strip().lower()
    if flag in ("openai", "1", "true", "yes", "omniroute"):
        return True
    # Auto: no Gemini/Vertex but OpenAI key present → bridge.
    has_gemini = bool(
        (os.environ.get("GEMINI_API_KEY") or "").strip()
        or (
            (os.environ.get("VERTEX_AI_PROJECT") or "").strip()
            and (os.environ.get("VERTEX_AI_LOCATION") or "").strip()
        )
    )
    has_openai = bool((os.environ.get("OPENAI_API_KEY") or "").strip())
    return (not has_gemini) and has_openai


def is_openai_model_name(model_name: str) -> bool:
    lower = (model_name or "").lower()
    return (
        "gpt" in lower
        or "o1" in lower
        or "o3" in lower
        or lower.startswith("openai/")
        or "claude" in lower
        or "llama" in lower
        or "qwen" in lower
        or "mistral" in lower
        or "deepseek" in lower
    )


def prefer_openai_backend(model_name: str) -> bool:
    return use_openai_compat_bridge() or is_openai_model_name(model_name)


_DEFAULT_BRIDGE_MODEL = "opencode/big-pickle"


def resolve_bridge_model_name(model_name: str) -> str:
    """When bridging Gemini-named defaults, map to an OpenAI-compatible model id."""
    if not use_openai_compat_bridge():
        return model_name
    override = (os.environ.get("OPENBENTT_PAPER_BRIDGE_MODEL") or "").strip()
    if override:
        return override
    lower = (model_name or "").lower()
    if "gemini" in lower or "imagen" in lower or not model_name:
        return _DEFAULT_BRIDGE_MODEL
    if (
        lower.startswith("openai/")
        or lower.startswith("openrouter/")
        or lower.startswith("meta-llama/")
        or lower in ("gpt-4o-mini", "gpt-4o")
        or ":free" in lower
    ):
        return _DEFAULT_BRIDGE_MODEL
    return model_name


def get_llm_parser(model_name: str, return_json: bool = True) -> Callable:
    if not return_json:
        return identity_parse

    if prefer_openai_backend(model_name):
        return parse_openai_json_results
    return parse_gemini_json_results


def call_llm_with_text_prompt(
    prompt: str,
    model_name: str,
    generation_configs: Optional[Dict[str, Any]] = None,
    check_parsed_response_not_none: bool = True,
    return_json: bool = True,
    result_parsing_func: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Unified function to call either Gemini or OpenAI models based on the model_name.
    """
    effective_model = resolve_bridge_model_name(model_name)
    parser = (
        result_parsing_func
        if result_parsing_func is not None
        else get_llm_parser(effective_model, return_json)
    )

    if generation_configs is None:
        generation_configs = {}

    if prefer_openai_backend(model_name) or prefer_openai_backend(effective_model):
        system_prompt = None
        configs_for_openai = dict(generation_configs) if generation_configs else {}
        if "system_instruction" in configs_for_openai:
            system_prompt = configs_for_openai.pop("system_instruction")
        if "temperature" in configs_for_openai:
            configs_for_openai.pop("temperature")

        response_dict = call_openai_models_with_text_prompt(
            prompt=prompt,
            model_name=effective_model,
            generation_configs=configs_for_openai,
            result_parsing_func=parser,
            check_parsed_response_not_none=check_parsed_response_not_none,
            system_prompt=system_prompt,
        )
        return response_dict
    else:
        response_dict = call_gemini_with_text_prompt(
            prompt=prompt,
            model_name=model_name,
            generation_configs=generation_configs,
            result_parsing_func=parser,
            check_parsed_response_not_none=check_parsed_response_not_none,
        )
        return response_dict


def call_llm_with_images(
    prompt: str,
    images: list[str],
    model_name: str,
    generation_configs: Optional[Dict[str, Any]] = None,
    check_parsed_response_not_none: bool = True,
    return_json: bool = True,
    result_parsing_func: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Unified function to call either Gemini or OpenAI models with images based on the model_name.
    """
    effective_model = resolve_bridge_model_name(model_name)
    parser = (
        result_parsing_func
        if result_parsing_func is not None
        else get_llm_parser(effective_model, return_json)
    )

    if generation_configs is None:
        generation_configs = {}

    if prefer_openai_backend(model_name) or prefer_openai_backend(effective_model):
        system_prompt = None
        # Copy to avoid side-effects on caller's dictionary
        configs_for_openai = dict(generation_configs) if generation_configs else {}
        if "system_instruction" in configs_for_openai:
            system_prompt = configs_for_openai.pop("system_instruction")
        if "temperature" in configs_for_openai:
            configs_for_openai.pop("temperature")

        content = [{"type": "text", "text": prompt}]
        for image_path in images:
            content.extend(get_openai_image_part_from_path(image_path))

        response_dict = call_openai_models_with_content(
            content=content,
            model_name=effective_model,
            generation_configs=configs_for_openai,
            result_parsing_func=parser,
            check_parsed_response_not_none=check_parsed_response_not_none,
            system_prompt=system_prompt,
        )
        return response_dict
    else:
        response_dict = call_gemini_with_images(
            prompt=prompt,
            images=images,
            model_name=model_name,
            generation_configs=generation_configs,
            result_parsing_func=parser,
            check_parsed_response_not_none=check_parsed_response_not_none,
        )
        return response_dict


def call_llm_with_pdf(
    pdf_path: str,
    prompt: str,
    model_name: str,
    system_instruction: Optional[str] = None,
    temperature: float = 0.7,
    check_parsed_response_not_none: bool = True,
    return_json: bool = True,
    result_parsing_func: Optional[Callable] = None,
) -> Dict[str, Any]:
    """
    Unified function to evaluate a PDF.
    Passes raw PDF bytes to Gemini, and extracted text to OpenAI.
    """
    effective_model = resolve_bridge_model_name(model_name)
    parser = (
        result_parsing_func
        if result_parsing_func is not None
        else get_llm_parser(effective_model, return_json)
    )

    if prefer_openai_backend(model_name) or prefer_openai_backend(effective_model):
        paper_text = load_paper(pdf_path, min_size=100)
        full_prompt = f"Paper Content:\n{paper_text}\n\nTask:\n{prompt}"

        generation_configs = {}
        response_dict = call_openai_models_with_text_prompt(
            prompt=full_prompt,
            model_name=effective_model,
            generation_configs=generation_configs,
            result_parsing_func=parser,
            check_parsed_response_not_none=check_parsed_response_not_none,
            system_prompt=system_instruction,
        )
        return response_dict
    else:
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

        contents = [
            types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
            types.Part.from_text(text=prompt),
        ]

        generation_configs = {"temperature": temperature}
        if system_instruction is not None:
            generation_configs["system_instruction"] = system_instruction

        response_dict = call_gemini_with_contents(
            contents=contents,
            model_name=model_name,
            generation_configs=generation_configs,
            result_parsing_func=parser,
            check_parsed_response_not_none=check_parsed_response_not_none,
        )
        return response_dict
