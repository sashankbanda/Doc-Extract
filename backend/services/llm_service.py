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

    def _assign_coord(self, highlight: Dict[str, Any], path: str, coord: List[Any]) -> None:
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
            coords_list.append(coord)
        else:
            coords_list = current.setdefault(leaf, [])
            coords_list.append(coord)

    def _line_ref_to_coord(
        self, ref: Any, line_metadata: Union[List[LineMeta], Dict[str, LineMeta]]
    ) -> Optional[List[Any]]:
        line_index = self._normalize_ref(ref)
        if line_index is None:
            return None

        meta = self._get_line_meta(line_metadata, line_index)
        if meta is None:
            return None

        return self._meta_to_coord(meta)

    def _normalize_ref(self, ref: Any) -> Optional[int]:
        if isinstance(ref, int):
            return ref
        if isinstance(ref, str):
            cleaned = ref.strip()
            if cleaned.isdigit():
                return int(cleaned)
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
        Normalize different metadata shapes to [page, x, y, width, height].
        """
        if isinstance(meta, dict):
            page = meta.get("page") or meta.get("p") or 0
            x = meta.get("x") or meta.get("left") or 0
            y = meta.get("y") or meta.get("top") or 0
            width = meta.get("width") or meta.get("w") or meta.get("right") or 1
            height = meta.get("height") or meta.get("h") or meta.get("bottom") or 1
            return [page, x, y, width, height]

        if isinstance(meta, (list, tuple)):
            if len(meta) >= 5:
                page, x, y, width, height = meta[:5]
                return [page, x, y, width, height]
            if len(meta) >= 4:
                # Format seen in highlight endpoint: [page, base_y, height, page_height]
                page, base_y, height_val, _page_height = meta[:4]
                top_y = (base_y - height_val) if height_val is not None else base_y
                return [page, 0, max(0, top_y), 1, height_val or 0]

        return None


llm_service = LLMService()

