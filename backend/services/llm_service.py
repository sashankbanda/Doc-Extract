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
            "You extract data from a Loss Run Report. "
            "Return ONLY valid JSON with the following structure:\n"
            "{\n"
            '  "data": {\n'
            '    "policy_info": {\n'
            '      "policy_number": string | null,\n'
            '      "insured_name": string | null,\n'
            '      "policy_term": {"start": string | null, "end": string | null},\n'
            '      "division": string | null,\n'
            '      "pac": string | null,\n'
            '      "master_producer": string | null\n'
            "    },\n"
            '    "claims": [\n'
            "      {\n"
            '        "claim_number": string | null,\n'
            '        "claimant": string | null,\n'
            '        "status": string | null,\n'
            '        "description": string | null,\n'
            '        "dates": {"event": string | null, "report": string | null, "closed": string | null},\n'
            '        "amounts": {"paid": number | null, "expense": number | null, "outstanding": number | null, "incurred": number | null}\n'
            "      }\n"
            "    ],\n"
            '    "totals": {\n'
            '      "subtotal": {"paid": number | null, "expense": number | null, "outstanding": number | null, "incurred": number | null},\n'
            '      "grand_total": {"paid": number | null, "expense": number | null, "outstanding": number | null, "incurred": number | null}\n'
            "    },\n"
            '    "report_info": {\n'
            '      "report_date": string | null,\n'
            '      "as_of_date": string | null,\n'
            '      "version": string | null\n'
            "    }\n"
            "  },\n"
            '  "_source_refs": {\n'
            '    "policy_info.policy_number": [int, ...],\n'
            '    "claims[0].claim_number": [int, ...],\n'
            "    ...\n"
            "  }\n"
            "}\n"
            "- The raw text contains line numbers in square brackets (e.g., [10]). "
            "_source_refs MUST list the line numbers used for every populated field. "
            "- Keep strictly to JSON. Do not add comments or extra keys. "
            "- If a field is not present, set it to null and omit the _source_refs entry."
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
                    "Structure the following Loss Run Report text. "
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

        data = parsed.get("data", {})
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

