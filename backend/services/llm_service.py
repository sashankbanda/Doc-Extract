import json
import logging
import os
from typing import Any, Dict, List, Optional, Union

import litellm

from backend.config import config
from backend.services.structured_organizer import structured_organizer


logger = logging.getLogger(__name__)

LineMeta = Union[List[Any], Dict[str, Any]]


class LLMService:
    """
    Handles LLM-powered extraction of raw fields from documents.
    
    The LLM only extracts raw fields with line numbers. All normalization,
    grouping, and highlight generation is handled by backend services.
    """

    def __init__(self) -> None:
        # Ensure the Groq key is available to LiteLLM.
        os.environ.setdefault("GROQ_API_KEY", config.GROQ_API_KEY)
        self.model = "groq/llama-3.3-70b-versatile"
        self.system_prompt = self._build_system_prompt()

    def _build_system_prompt(self) -> str:
        """
        Build system prompt that instructs LLM to extract a flat array of items with line numbers.
        No normalization, grouping, structure inference, or coordinate math - just raw extraction.
        """
        return (
            "You are an expert insurance document extraction AI. Your goal is to extract **ALL** visible data from the Loss Run Report.\n\n"
            "**CRITICAL: Your role is ONLY to extract raw fields exactly as seen in the document.**\n\n"
            "**STRICT RULES - YOU MUST FOLLOW THESE:**\n\n"
            "1. Extract EVERY visible field/value from the document\n"
            "2. Do NOT normalize keys (use exact labels as they appear)\n"
            "3. Do NOT group claims or create nested structure\n"
            "4. Do NOT invent structure or infer relationships\n"
            "5. Do NOT skip columns or summarize data\n"
            "6. Do NOT infer missing values\n"
            "7. Do NOT guess line numbers - if unclear, skip the item\n\n"
            "**Line Number References:**\n\n"
            "- The raw text contains line numbers in square brackets (e.g., [15], [0x11])\n"
            "- For each field, list ALL line numbers where that field's value appears\n"
            "- Line numbers must match the [NN] markers in the text EXACTLY\n"
            "- Multi-line values → include all line numbers (e.g., [15, 16, 17])\n"
            "- If line numbers are unclear or missing → skip the item (do NOT guess)\n\n"
            "**Output JSON Structure (MANDATORY):**\n\n"
            "Return valid JSON with this EXACT structure:\n"
            "{\n"
            '  "items": [\n'
            "    {\n"
            '      "key": "Claimant Name",\n'
            '      "value": "SYDIA",\n'
            '      "line_numbers": [15, 16, 17]\n'
            "    },\n"
            "    {\n"
            '      "key": "Claim Number",\n'
            '      "value": "12345",\n'
            '      "line_numbers": [12]\n'
            "    }\n"
            "  ]\n"
            "}\n\n"
            "**Requirements:**\n\n"
            "- `items` is an array\n"
            "- One object per extracted value\n"
            "- `key` = exact label as it appears in document\n"
            "- `value` = exact value as it appears (no transformation)\n"
            "- `line_numbers` = array of integers matching [NN] markers exactly\n"
            "- If a value exists, it MUST have line_numbers\n"
            "- If line_numbers are unclear → skip the item (do NOT guess)\n"
            "- Keep strictly to JSON. Do not add comments or extra keys.\n"
            "- If a field is not present, omit it (do not include null values)."
        )

    async def structure_document(
        self, raw_text: str, line_metadata: Union[List[LineMeta], Dict[str, LineMeta]]
    ) -> Dict[str, Any]:
        """
        Extract flat items array from document using LLM.
        
        Returns simple structure:
        {
            "items": [
                {"key": "Claimant Name", "value": "SYDIA", "line_numbers": [15, 16, 17]},
                ...
            ]
        }
        
        No normalization, grouping, or complex logic - just raw extraction with line numbers.
        """
        # Call LLM to extract items
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": (
                    "Extract data from the following document text. "
                    "Text includes line numbers in square brackets like [12] or [0x11]. "
                    "List the line numbers for each field in the 'line_numbers' array.\n\n"
                    f"{raw_text}"
                ),
            },
        ]

        response = await litellm.acompletion(
            model=self.model,
            messages=messages,
            response_format={"type": "json_object"},
        )
        content = response["choices"][0]["message"]["content"]

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            # If the model returns leading/trailing text, try to salvage JSON payload.
            start = content.find("{")
            end = content.rfind("}")
            if start != -1 and end != -1 and end > start:
                parsed = json.loads(content[start : end + 1])
            else:
                raise

        # Extract items from LLM response
        raw_items = parsed.get("items", [])
        if not raw_items:
            logger.warning("[LLMService] No items found in LLM response")
            raw_items = []

        # Convert and validate items: normalize line_numbers format
        items = []
        invalid_items = []
        
        for item in raw_items:
            key = item.get("key", "").strip()
            value = item.get("value", "").strip()
            line_numbers_raw = item.get("line_numbers", [])
            
            # Skip items with empty key or value
            if not key or not value:
                invalid_items.append({"item": item, "reason": "empty key or value"})
                continue
            
            # Convert line numbers to integers (handles hex, strings, etc.)
            line_numbers = []
            for line_val in line_numbers_raw:
                converted = self._convert_line_number(line_val)
                if converted is not None:
                    line_numbers.append(converted)
            
            # Skip items with no valid line numbers (per requirements: fail silently)
            if not line_numbers:
                invalid_items.append({"item": item, "reason": "no valid line_numbers"})
                continue
            
            # Add validated item
            items.append({
                "key": key,
                "value": value,
                "line_numbers": sorted(list(set(line_numbers)))  # Deduplicate and sort
            })
        
        if invalid_items:
            logger.info(f"[LLMService] Skipped {len(invalid_items)} items with invalid line_numbers or empty values")
        
        # Organize items into readable sections (deterministic, no AI)
        organized = structured_organizer.organize(items)
        
        return organized

    def _convert_line_number(self, line_val: Any) -> Optional[int]:
        """
        Convert a line number to an integer, handling hex strings and other formats.
        
        Handles:
        - Integers: returns as-is
        - Hex strings: "2A" -> 42, "0x2A" -> 42
        - Float integers: 2.0 -> 2
        - String integers: "42" -> 42
        
        Returns None if conversion fails.
        """
        if isinstance(line_val, int):
            return line_val if line_val >= 0 else None
        
        if isinstance(line_val, float):
            # Check if it's effectively an integer
            if line_val.is_integer() and line_val >= 0:
                return int(line_val)
            return None
        
        if isinstance(line_val, str):
            line_str = line_val.strip()
            # Try hex format (with or without 0x prefix)
            if line_str.startswith("0x") or line_str.startswith("0X"):
                try:
                    return int(line_str, 16)
                except ValueError:
                    pass
            # Try hex without prefix (e.g., "2A", "2C")
            try:
                # Check if it looks like hex (contains A-F)
                if any(c in line_str.upper() for c in "ABCDEF"):
                    return int(line_str, 16)
            except ValueError:
                pass
            # Try regular integer
            try:
                val = int(line_str)
                return val if val >= 0 else None
            except ValueError:
                pass
        
        return None



llm_service = LLMService()


