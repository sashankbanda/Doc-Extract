import json
import os
from typing import Any, Dict, List, Optional, Union

import litellm

from backend.config import config


LineMeta = Union[List[Any], Dict[str, Any]]


class LLMService:
    """
    Handles LLM-powered structuring of LLMWhisperer output and maps the
    extracted fields back to PDF coordinates via provided line metadata.
    """

    def __init__(self) -> None:
        # Ensure the Groq key is available to LiteLLM.
        os.environ.setdefault("GROQ_API_KEY", config.GROQ_API_KEY)
        self.model = "groq/llama-3.3-70b-versatile"
        self.system_prompt = self._build_system_prompt()

    def _build_system_prompt(self) -> str:
        return (
            "You are an expert insurance document extraction AI. Your goal is to extract **ALL** data from the Loss Run Report into a structured JSON format.\n\n"
            "**1. Extraction Rules:**\n\n"
            "- **Main Claims Table:** Extract every row. Map *every* visible column to the closest Canonical Key below. Do not ignore columns like \"Notification Date\", \"Cause\", or \"Coverage\".\n\n"
            "- **Multiline Text:** Text in columns like \"Description\" or \"Claimant\" often spans multiple lines. **Merge all lines** belonging to the same row entry into a single string.\n\n"
            "- **Secondary Tables:** Look for summary tables (e.g., \"Policy Period Totals\", \"Financial Summary\"). Extract them into the `policy_period_summary` section.\n\n"
            "**2. Canonical Keys & Synonyms (Use these keys for the JSON):**\n\n"
            "- `claimNumber`: Claim No, Claim #, File Number\n"
            "- `policyNumber`: Policy No, Policy # (Capture this even if inside the claims table)\n"
            "- `claimant`: Claimant Name, Injured Worker\n"
            "- `dateOfLoss`: Loss Date, Accident Date, Occurrence Date\n"
            "- `reportedDate`: Notification Date, Date Reported, Report Date\n"
            "- `claimStatus`: Status, Open/Closed\n"
            "- `lossDescription`: Description, Accident Description, Desc\n"
            "- `coverageSection`: Coverage, Cov Section, LOB, Div\n"
            "- `causeOfLoss`: Cause, Cause Description, Injury Code\n"
            "- `totalPaid`: Total Paid, Gross Paid, Total Gross Incurred\n"
            "- `paidAlae`: Paid ALAE, Paid Expense, Legal Paid\n"
            "- `totalIncurred`: Total Incurred, Incurred Loss\n"
            "- `totalReserves`: Total Reserves, Outstanding\n\n"
            "**3. Output JSON Structure:**\n\n"
            "Return valid JSON with this exact structure:\n"
            "{\n"
            '  "data": {\n'
            '    "report_info": {\n'
            '        "insured": string,\n'
            '        "run_date": string,\n'
            '        "policy_number_header": string\n'
            "    },\n"
            '    "claims": [\n'
            "      {\n"
            '        "claimNumber": string,\n'
            '        "policyNumber": string, // The policy # listed IN THE ROW\n'
            '        "dateOfLoss": string,\n'
            '        "reportedDate": string,\n'
            '        "claimStatus": string,\n'
            '        "claimant": string,\n'
            '        "lossDescription": string,\n'
            '        "coverageSection": string,\n'
            '        "causeOfLoss": string,\n'
            '        "totalPaid": number,\n'
            '        "paidAlae": number,\n'
            '        "totalReserves": number\n'
            "      }\n"
            "    ],\n"
            '    "policy_period_summary": {\n'
            '       "periods": [\n'
            '          { "policy_period": string, "policy_number": string, "claim_count": number, "total_paid": number }\n'
            "       ]\n"
            "    }\n"
            "  },\n"
            '  "_source_refs": {\n'
            '    "data.report_info.insured": [1],\n'
            '    "data.claims[0].claimNumber": [15],\n'
            "    ...\n"
            "  }\n"
            "}\n\n"
            "**Important:**\n\n"
            "- If a column exists in the document (like \"Notification Date\"), you MUST map it.\n"
            "- `_source_refs` are mandatory for highlighting.\n"
            "- The raw text contains line numbers in square brackets (e.g., [10]). "
            "_source_refs MUST list the line numbers used for every populated field.\n"
            "- Keep strictly to JSON. Do not add comments or extra keys.\n"
            "- If a field is not present, omit it or set to null."
        )

    async def structure_document(
        self, raw_text: str, line_metadata: Union[List[LineMeta], Dict[str, LineMeta]]
    ) -> Dict[str, Any]:
        """
        Run the LLM to structure the document and map source references to coordinates.
        """
        messages = [
            {"role": "system", "content": self.system_prompt},
            {
                "role": "user",
                "content": (
                    "Extract data from the following document text. "
                    "Text includes line numbers like [12]. Use them in _source_refs.\n\n"
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

        # Handle new structure: summary and claims at top level, or wrapped in "data"
        if "data" in parsed:
            data = parsed["data"]
        else:
            # If no "data" wrapper, assume summary and claims are at top level
            data = {
                "summary": parsed.get("summary", {}),
                "claims": parsed.get("claims", []),
            }
        
        source_refs = parsed.get("_source_refs", {})
        highlight_data = self._build_highlight_data(source_refs, line_metadata)

        return {
            "data": data,
            "_source_refs": source_refs,
            "highlight_data": highlight_data,
        }

    def _build_highlight_data(
        self,
        source_refs: Dict[str, Any],
        line_metadata: Union[List[LineMeta], Dict[str, LineMeta]],
    ) -> Dict[str, Any]:
        highlight: Dict[str, Any] = {}
        if not source_refs:
            return highlight

        for path, refs in source_refs.items():
            ref_list = refs if isinstance(refs, list) else [refs]
            for ref in ref_list:
                coord = self._line_ref_to_coord(ref, line_metadata)
                if coord is None:
                    continue
                self._assign_coord(highlight, path, coord)
        return highlight

    def _assign_coord(self, highlight: Dict[str, Any], path: str, coord_data: Dict[str, Any]) -> None:
        parts = path.replace("]", "").split(".")
        current = highlight
        for part in parts[:-1]:
            # Remove array markers like claims[0]
            if "[" in part:
                base, index = part.split("[", 1)
                base_dict = current.setdefault(base, {})
                index_key = index if index else "0"
                current = base_dict.setdefault(index_key, {})
            else:
                current = current.setdefault(part, {})
        leaf = parts[-1]
        if "[" in leaf:
            base, index = leaf.split("[", 1)
            leaf_dict = current.setdefault(base, {})
            index_key = index if index else "0"
            coords_list = leaf_dict.setdefault(index_key, [])
            coords_list.append(coord_data)
        else:
            coords_list = current.setdefault(leaf, [])
            coords_list.append(coord_data)

    def _line_ref_to_coord(
        self, ref: Any, line_metadata: Union[List[LineMeta], Dict[str, LineMeta]]
    ) -> Optional[Dict[str, Any]]:
        line_index = self._normalize_ref(ref)
        if line_index is None:
            return None

        meta = self._get_line_meta(line_metadata, line_index)
        if meta is None:
            return None

        # Extract page from metadata
        page = None
        if isinstance(meta, dict):
            page = meta.get("page") or meta.get("p")
        elif isinstance(meta, (list, tuple)) and len(meta) > 0:
            page = meta[0]  # First element is typically page
        
        # Get coordinates [x, y, width, height]
        coords = self._meta_to_coord(meta)
        if coords is None:
            return None
        
        # Return object with both coordinates and page
        return {
            "coords": coords,  # [x, y, width, height]
            "page": page if page is not None else 0  # Default to 0 if page not found
        }

    def _normalize_ref(self, ref: Any) -> Optional[int]:
        if isinstance(ref, int):
            return ref
        if isinstance(ref, str):
            cleaned = ref.strip()
            # Support decimal numbers
            if cleaned.isdigit():
                return int(cleaned)
            # Support hexadecimal references (e.g., "0x11", "1A", "2C")
            if cleaned.startswith("0x") or cleaned.startswith("0X"):
                try:
                    return int(cleaned, 16)
                except ValueError:
                    return None
            # Support hex without prefix (e.g., "1A", "2C")
            try:
                return int(cleaned, 16)
            except ValueError:
                pass
        return None

    def _get_line_meta(
        self, line_metadata: Union[List[LineMeta], Dict[str, LineMeta]], idx: int
    ) -> Optional[LineMeta]:
        # Prefer exact match; fall back to off-by-one (common when LLM counts from 1).
        candidates: List[Optional[LineMeta]] = []

        if isinstance(line_metadata, dict):
            candidates.extend(
                [
                    line_metadata.get(str(idx)),
                    line_metadata.get(idx),
                    line_metadata.get(str(idx - 1)),
                    line_metadata.get(idx - 1),
                ]
            )
        elif isinstance(line_metadata, list):
            if 0 <= idx < len(line_metadata):
                candidates.append(line_metadata[idx])
            if 0 <= idx - 1 < len(line_metadata):
                candidates.append(line_metadata[idx - 1])

        for candidate in candidates:
            if candidate is not None:
                return candidate
        return None

    def _meta_to_coord(self, meta: LineMeta) -> Optional[List[Any]]:
        """
        Normalize different metadata shapes to [x, y, width, height] (4 values, NO page field).
        Returns None if coordinates cannot be determined.
        """
        if isinstance(meta, dict):
            x = meta.get("x") or meta.get("left")
            y = meta.get("y") or meta.get("top")
            width = meta.get("width") or meta.get("w") or meta.get("right")
            height = meta.get("height") or meta.get("h") or meta.get("bottom")
            
            # Return None if any required coordinate is missing or invalid
            if x is None or y is None or width is None or height is None:
                return None
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return None
            if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
                return None
            if width <= 0 or height <= 0:
                return None
                
            return [x, y, width, height]

        if isinstance(meta, (list, tuple)):
            if len(meta) >= 5:
                # Format: [page, x, y, width, height] - extract coordinates only
                _, x, y, width, height = meta[:5]
                if x is None or y is None or width is None or height is None:
                    return None
                if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                    return None
                if not isinstance(width, (int, float)) or not isinstance(height, (int, float)):
                    return None
                if width <= 0 or height <= 0:
                    return None
                return [x, y, width, height]
            if len(meta) >= 4:
                # Format seen in highlight endpoint: [page, base_y, height, page_height]
                # Convert to [x, y, width, height] where x=0 (full-width line), y=top_y, width=page_height (proxy), height=height_val
                _, base_y, height_val, page_height = meta[:4]
                if base_y is None or height_val is None or page_height is None:
                    return None
                if not isinstance(base_y, (int, float)) or not isinstance(height_val, (int, float)) or not isinstance(page_height, (int, float)):
                    return None
                if height_val <= 0 or page_height <= 0:
                    return None
                top_y = max(0, base_y - height_val)
                # For full-width lines, use page_height as a reasonable width estimate
                # This is a common pattern where lines span the full page width
                return [0, top_y, page_height, height_val]

        return None


llm_service = LLMService()

