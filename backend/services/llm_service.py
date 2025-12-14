import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple, Union

import litellm

from backend.config import config
from backend.services.normalization_service import normalization_service
from backend.services.grouping_service import grouping_service
from backend.services.metadata_service import metadata_service, StandardizedMetadata


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
        Build system prompt that instructs LLM to only extract raw fields with line numbers.
        No normalization, grouping, or canonical keys - just raw extraction.
        """
        return (
            "You are an expert insurance document extraction AI. Your goal is to extract **ALL** data from the Loss Run Report.\n\n"
            "**CRITICAL: Your role is ONLY to extract raw fields exactly as seen in the document.**\n\n"
            "**1. Extraction Rules:**\n\n"
            "- Extract every visible field/column from the document\n"
            "- Use the EXACT label as it appears in the document (e.g., \"Claimant Name\", \"Notification Date\")\n"
            "- Extract the EXACT value as it appears (do not normalize or transform)\n"
            "- For multiline values, indicate which lines belong together by listing all line numbers\n"
            "- Do NOT guess missing data\n"
            "- Do NOT normalize field names to canonical keys\n"
            "- Do NOT group fields\n"
            "- Do NOT use array indices in your output\n\n"
            "**2. Line Number References:**\n\n"
            "- The raw text contains line numbers in square brackets (e.g., [15])\n"
            "- For each field, list ALL line numbers where that field's value appears\n"
            "- Line numbers must match the [NN] markers in the text EXACTLY\n"
            "- If a field spans multiple lines, include all line numbers (e.g., [15, 16, 17])\n\n"
            "**3. Output JSON Structure:**\n\n"
            "Return valid JSON with this exact structure:\n"
            "{\n"
            '  "raw_fields": [\n'
            "    {\n"
            '      "label": "Claimant Name",\n'
            '      "value": "SYDIA",\n'
            '      "lines": [15, 16, 17]\n'
            "    },\n"
            "    {\n"
            '      "label": "Claim Number",\n'
            '      "value": "12345",\n'
            '      "lines": [12]\n'
            "    }\n"
            "    // ... more fields\n"
            "  ]\n"
            "}\n\n"
            "**Important:**\n\n"
            "- Extract ALL visible fields from the document\n"
            "- Use exact labels as they appear (e.g., \"Notification Date\", not \"reportedDate\")\n"
            "- Use exact values as they appear (no normalization)\n"
            "- List ALL line numbers where each field appears\n"
            "- Line numbers must match [NN] markers exactly\n"
            "- Keep strictly to JSON. Do not add comments or extra keys.\n"
            "- If a field is not present, omit it (do not include null values)."
        )

    async def structure_document(
        self, raw_text: str, line_metadata: Union[List[LineMeta], Dict[str, LineMeta]]
    ) -> Dict[str, Any]:
        """
        Run the LLM to extract raw fields, then normalize, group, and build highlights.
        
        Pipeline:
        1. LLM extracts raw fields with line numbers
        2. Normalize raw labels to canonical keys
        3. Group normalized fields into semantic sections
        4. Build flat highlight data with stable field IDs
        5. Return structured data with diagnostics
        """
        # Step 1: Standardize line metadata at ingestion
        standardized_metadata = metadata_service.standardize_metadata(line_metadata)
        
        # Step 2: Call LLM to extract raw fields
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": (
                    "Extract data from the following document text. "
                    "Text includes line numbers in square brackets like [12]. "
                    "List the line numbers for each field in the 'lines' array.\n\n"
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

        # Extract raw fields from LLM response
        raw_fields = parsed.get("raw_fields", [])
        if not raw_fields:
            logger.warning("[LLMService] No raw_fields found in LLM response")
            raw_fields = []

        # Step 3: Normalize fields (map raw labels to canonical keys)
        # Initially normalize without ignored lines (will be updated after noise detection)
        normalization_result = normalization_service.normalize_fields(raw_fields, ignored_lines=[])
        normalized_fields = normalization_result["normalized"]
        unmapped_fields = normalization_result["unmapped_fields"]
        field_confidence = normalization_result.get("field_confidence", {})
        label_collisions = normalization_result.get("label_collisions", [])

        # Step 4: Group normalized fields into semantic sections (with page-aware claim windows)
        grouped_data = grouping_service.group_fields(normalized_fields, standardized_metadata)
        
        # Get ignored lines from grouping service (header/footer noise)
        ignored_lines = grouped_data.get("_ignored_lines", [])
        
        # Re-normalize with ignored lines to filter out noise
        if ignored_lines:
            normalization_result = normalization_service.normalize_fields(raw_fields, ignored_lines=ignored_lines)
            normalized_fields = normalization_result["normalized"]
            # Update other results but keep original field_confidence and label_collisions
            unmapped_fields = normalization_result["unmapped_fields"]
            label_collisions = normalization_result.get("label_collisions", [])
        
        # Apply strict mode filtering if enabled
        if config.STRICT_EXTRACTION:
            normalized_fields, dropped_fields = self._apply_strict_mode(
                normalized_fields, field_confidence, label_collisions, grouped_data
            )
            # Update diagnostics with dropped fields
            if dropped_fields:
                logger.info(f"[LLMService] Strict mode: dropped {len(dropped_fields)} low-confidence/ambiguous fields")
        else:
            dropped_fields = []
        
        # Step 5: Build flat highlight data with stable field IDs
        highlight_data, invalid_refs, missing_metadata = self._build_flat_highlights(
            normalized_fields, standardized_metadata
        )

        # Step 6: Build stable field ID references (replaces _source_refs)
        field_refs = self._build_field_refs(normalized_fields)

        # Step 7: Build backward-compatible _source_refs from field_refs and grouped data
        # (Must happen before removing _line_refs from claims)
        source_refs = self._build_backward_compatible_source_refs(
            field_refs, grouped_data, normalized_fields
        )

        # Step 8: Remove internal tracking fields before returning (frontend doesn't need them)
        claims = grouped_data.get("claims", [])
        for claim in claims:
            if "_line_refs" in claim:
                del claim["_line_refs"]
        
        # Remove internal line refs from report_info
        report_info = grouped_data.get("report_info", {})
        keys_to_remove = [k for k in report_info.keys() if k.startswith("_") and k.endswith("_line_refs")]
        for key in keys_to_remove:
            del report_info[key]

        # Step 9: Build diagnostics (including all new diagnostic information)
        claim_warnings = grouped_data.get("_claim_warnings", [])
        assignment_traces = grouped_data.get("_assignment_traces", [])
        ignored_lines = grouped_data.get("_ignored_lines", [])
        
        diagnostics = {
            "unmapped_fields": unmapped_fields,
            "invalid_refs": invalid_refs,
            "missing_metadata": missing_metadata,
            "claim_grouping_warnings": claim_warnings,
            "field_confidence": field_confidence,  # Confidence scores per canonical field
            "label_collisions": label_collisions,  # Same label, different meaning
            "claim_assignment_trace": assignment_traces,  # Why fields were assigned to claims
            "ignored_lines": ignored_lines,  # Header/footer noise lines
            "dropped_fields": dropped_fields if config.STRICT_EXTRACTION else [],  # Fields dropped in strict mode
        }

        return {
            "data": {
                "groups": grouped_data.get("groups", {}),  # New semantic groups
                "report_info": grouped_data.get("report_info", {}),  # Backward compatibility
                "claims": grouped_data.get("claims", []),  # Backward compatibility (with _line_refs removed)
                "policy_period_summary": grouped_data.get("policy_period_summary", {}),  # Backward compatibility
            },
            "field_refs": field_refs,  # Stable field IDs, no array indices
            "_source_refs": source_refs,  # Backward-compatible format for frontend
            "highlight_data": highlight_data,  # Flat structure
            "diagnostics": diagnostics,
        }

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

    def _build_field_refs(
        self, normalized_fields: Dict[str, List[Dict[str, Any]]]
    ) -> Dict[str, List[int]]:
        """
        Build stable field ID references (replaces _source_refs).
        
        Returns: { "claimant": [15, 16, 17], "policyNumber": [5], ... }
        No nesting, no array indices - one key = one semantic field.
        """
        field_refs: Dict[str, List[int]] = {}
        
        for canonical_key, field_list in normalized_fields.items():
            # Collect all line numbers for this field
            all_lines: List[int] = []
            for field in field_list:
                lines = field.get("lines", [])
                if isinstance(lines, list):
                    for line in lines:
                        converted = self._convert_line_number(line)
                        if converted is not None:
                            all_lines.append(converted)
            
            if all_lines:
                # Remove duplicates and sort
                field_refs[canonical_key] = sorted(list(set(all_lines)))
        
        return field_refs

    def _build_flat_highlights(
        self,
        normalized_fields: Dict[str, List[Dict[str, Any]]],
        standardized_metadata: List[Optional[StandardizedMetadata]],
    ) -> Tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Build flat highlight data structure.
        
        Returns:
            - highlight_data: { "claimant": [{page, x, y, width, height}, ...], ... }
            - invalid_refs: List of invalid line references
            - missing_metadata: List of missing metadata entries
        """
        highlight_data: Dict[str, List[Dict[str, Any]]] = {}
        invalid_refs: List[Dict[str, Any]] = []
        missing_metadata: List[Dict[str, Any]] = []
        
        for canonical_key, field_list in normalized_fields.items():
            highlights: List[Dict[str, Any]] = []
            
            for field in field_list:
                lines = field.get("lines", [])
                if not isinstance(lines, list):
                    invalid_refs.append({
                        "field": canonical_key,
                        "reason": "lines is not a list",
                        "value": field.get("value"),
                    })
                    continue
                
                for line_num in lines:
                    # Convert line number (handles hex strings, floats, etc.)
                    converted_line = self._convert_line_number(line_num)
                    if converted_line is None:
                        invalid_refs.append({
                            "field": canonical_key,
                            "line": line_num,
                            "reason": f"line number cannot be converted to integer (got {type(line_num).__name__}: {line_num})",
                        })
                        continue
                    
                    line_num = converted_line
                    
                    # Get standardized metadata (no off-by-one, no hex parsing)
                    if line_num >= len(standardized_metadata):
                        missing_metadata.append({
                            "field": canonical_key,
                            "line": line_num,
                            "reason": f"line index {line_num} out of range (max: {len(standardized_metadata) - 1})",
                        })
                        continue
                    
                    std_meta = standardized_metadata[line_num]
                    if std_meta is None:
                        missing_metadata.append({
                            "field": canonical_key,
                            "line": line_num,
                            "reason": "metadata is None (invalid or missing)",
                        })
                        continue
                    
                    # Build highlight rectangle
                    highlight_rect = {
                        "page": std_meta.page,
                        "x": std_meta.x,
                        "y": std_meta.y,
                        "width": std_meta.width,
                        "height": std_meta.height,
                    }
                    highlights.append(highlight_rect)
            
            # Deduplicate highlights by coordinates (same line can appear multiple times)
            if highlights:
                # Remove duplicates based on (page, x, y, width, height)
                seen = set()
                deduplicated = []
                for rect in highlights:
                    key = (
                        rect.get("page"),
                        rect.get("x"),
                        rect.get("y"),
                        rect.get("width"),
                        rect.get("height"),
                    )
                    if key not in seen:
                        seen.add(key)
                        deduplicated.append(rect)
                
                # Keep order stable (first occurrence wins)
                highlight_data[canonical_key] = deduplicated
            
            if highlights:
                highlight_data[canonical_key] = highlights
        
        return highlight_data, invalid_refs, missing_metadata
    
    def _apply_strict_mode(
        self,
        normalized_fields: Dict[str, List[Dict[str, Any]]],
        field_confidence: Dict[str, float],
        label_collisions: List[Dict[str, Any]],
        grouped_data: Dict[str, Any]
    ) -> Tuple[Dict[str, List[Dict[str, Any]]], List[Dict[str, Any]]]:
        """
        Apply strict mode filtering.
        
        When STRICT_EXTRACTION is enabled:
        - Drop low-confidence fields (< 0.4)
        - Drop ambiguous collisions
        - Drop fields outside claim windows entirely
        
        Returns:
            - Filtered normalized_fields
            - List of dropped fields for diagnostics
        """
        dropped_fields: List[Dict[str, Any]] = []
        filtered_fields: Dict[str, List[Dict[str, Any]]] = {}
        
        # Build set of collision-affected canonical keys
        collision_keys = set()
        for collision in label_collisions:
            collision_keys.add(collision.get("mapped_to"))
        
        # Filter fields
        for canonical_key, field_list in normalized_fields.items():
            confidence = field_confidence.get(canonical_key, 0.0)
            
            # Drop low-confidence fields
            if confidence < 0.4:
                dropped_fields.append({
                    "field": canonical_key,
                    "reason": f"low confidence ({confidence:.2f} < 0.4)",
                    "confidence": confidence,
                })
                logger.info(f"[LLMService] Strict mode: dropping '{canonical_key}' (confidence {confidence:.2f})")
                continue
            
            # Drop ambiguous collisions
            if canonical_key in collision_keys:
                dropped_fields.append({
                    "field": canonical_key,
                    "reason": "ambiguous collision (same label in different regions)",
                    "confidence": confidence,
                })
                logger.info(f"[LLMService] Strict mode: dropping '{canonical_key}' (collision detected)")
                continue
            
            # Keep the field
            filtered_fields[canonical_key] = field_list
        
        return filtered_fields, dropped_fields
    
    def _build_backward_compatible_source_refs(
        self,
        field_refs: Dict[str, List[int]],
        grouped_data: Dict[str, Any],
        normalized_fields: Dict[str, List[Dict[str, Any]]],
    ) -> Dict[str, List[int]]:
        """
        Build backward-compatible _source_refs from field_refs.
        
        CRITICAL: For claims, use only the line numbers that belong to that specific claim.
        Each claim object has internal _line_refs tracking which lines belong to each field.
        
        Maps stable field IDs to old path format (e.g., "claims[0].claimant")
        for frontend compatibility.
        """
        source_refs: Dict[str, List[int]] = {}
        
        # Map report_info fields (handle arrays with per-index line refs)
        report_info = grouped_data.get("report_info", {})
        for key, value in report_info.items():
            # Skip internal line refs tracking
            if key.startswith("_"):
                continue
            
            # Check if this field has array line refs
            line_refs_key = f"_{key}_line_refs"
            if line_refs_key in report_info:
                line_refs = report_info[line_refs_key]
                if isinstance(value, list):
                    # Array: map each index to its specific line numbers
                    if isinstance(line_refs, dict):
                        for idx in range(len(value)):
                            if idx in line_refs:
                                source_refs[f"data.report_info.{key}[{idx}]"] = line_refs[idx]
                                source_refs[f"report_info.{key}[{idx}]"] = line_refs[idx]
                else:
                    # Single value: use the line refs directly (stored as list)
                    if isinstance(line_refs, list):
                        source_refs[f"data.report_info.{key}"] = line_refs
                        source_refs[f"report_info.{key}"] = line_refs
            elif key in field_refs:
                # Fallback: use global field_refs
                source_refs[f"data.report_info.{key}"] = field_refs[key]
                source_refs[f"report_info.{key}"] = field_refs[key]
        
        # Map claims fields - CRITICAL: use claim-specific line numbers from _line_refs
        claims = grouped_data.get("claims", [])
        for idx, claim in enumerate(claims):
            # Get claim-specific line refs (internal tracking)
            claim_line_refs = claim.get("_line_refs", {})
            
            for key, value in claim.items():
                # Skip internal tracking field
                if key == "_line_refs":
                    continue
                
                # Use claim-specific line numbers if available, otherwise fall back to global
                if key in claim_line_refs:
                    # Use only the lines that belong to this specific claim
                    claim_specific_lines = claim_line_refs[key]
                    source_refs[f"data.claims[{idx}].{key}"] = claim_specific_lines
                    source_refs[f"claims[{idx}].{key}"] = claim_specific_lines
                elif key in field_refs:
                    # Fallback: use global field_refs (shouldn't happen with proper claim assembly)
                    logger.warning(
                        f"[LLMService] Claim {idx} field '{key}' missing from _line_refs, "
                        f"using global field_refs (may cause incorrect highlights)"
                    )
                    source_refs[f"data.claims[{idx}].{key}"] = field_refs[key]
                    source_refs[f"claims[{idx}].{key}"] = field_refs[key]
        
        # Map policy_period_summary fields
        policy_periods = grouped_data.get("policy_period_summary", {}).get("periods", [])
        for idx, period in enumerate(policy_periods):
            for key, value in period.items():
                if key in field_refs:
                    source_refs[f"data.policy_period_summary.periods[{idx}].{key}"] = field_refs[key]
                    source_refs[f"policy_period_summary.periods[{idx}].{key}"] = field_refs[key]
        
        return source_refs


llm_service = LLMService()


