"""
Deterministic organizer for flat items[] array.

Converts flat extraction items into readable UI sections while preserving
exact line numbers. No AI, no guessing, no line number modification.
"""

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Static semantic category mappings (NO AI, NO GUESSING)
CLAIM_KEYS = {
    "Claim Number",
    "Claim Number:",
    "Claim #",
    "Claimant",
    "Claimant Name",
    "Claimant:",
    "Loss Date",
    "Date of Loss",
    "Date Of Loss",
    "Loss Date:",
    "Notification Date",
    "Reported Date",
    "Reported Date:",
    "Notification Date:",
    "Claim Status",
    "Status",
    "Claim Status:",
    "Claim Description",
    "Description",
    "Loss Description",
    "Claim Description:",
    "Coverage",
    "Coverage Section",
    "Coverage:",
    "Paid",
    "Paid Loss",
    "Paid ALAE",
    "Total Paid",
    "Paid:",
    "Paid Loss:",
    "Paid ALAE:",
    "Total Paid:",
    "Cause of Loss",
    "Cause Of Loss",
    "Cause of Loss:",
}

POLICY_KEYS = {
    "Policy Number",
    "Policy #",
    "Policy Number:",
    "Policy #:",
    "Effective Date",
    "Effective Date:",
    "Expiration Date",
    "Expiration Date:",
    "Policy Period",
    "Policy Period:",
    "Insured",
    "Insured Name",
    "Insured:",
    "Insured Name:",
    "Insured(s)",
    "Insured(s):",
}

SUMMARY_KEYS = {
    "Total # Claims",
    "Total Claims",
    "Total # Claims:",
    "Total Claims:",
    "Total Paid",
    "Total Paid:",
    "Totals",
    "Totals:",
    "Summary",
    "Summary:",
}

REPORT_INFO_KEYS = {
    "Run As Of",
    "Run As Of:",
    "Report Date",
    "Report Date:",
    "As Of Date",
    "As Of Date:",
    "Version",
    "Version:",
}


class StructuredOrganizer:
    """
    Organizes flat items[] into readable sections using deterministic rules.
    
    Rules:
    1. Group by semantic category using static key mappings
    2. Build claim objects using line number proximity (not AI)
    3. Preserve exact line numbers - never modify or guess
    """

    def organize(self, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Organize flat items into structured sections.
        
        Args:
            items: List of items with {key, value, line_numbers}
            
        Returns:
            {
                "sections": {
                    "Claims": [...],
                    "Policy Info": {...},
                    "Summary": {...},
                    "Report Info": {...},
                    "Other": {...}
                }
            }
        """
        if not items:
            return {"sections": {}}

        # Categorize items by semantic key
        claim_items = []
        policy_items = []
        summary_items = []
        report_info_items = []
        other_items = []

        for item in items:
            key = item.get("key", "").strip()
            if not key:
                continue

            # Normalize key for matching (remove trailing colons, case-insensitive)
            normalized_key = key.rstrip(":").strip().lower()

            # Check exact match first, then substring match
            if normalized_key in {k.lower() for k in CLAIM_KEYS}:
                claim_items.append(item)
            elif any(
                claim_key.lower() in normalized_key
                for claim_key in CLAIM_KEYS
                if len(claim_key) > 5  # Avoid matching short keys like "Paid"
            ):
                claim_items.append(item)
            elif normalized_key in {k.lower() for k in POLICY_KEYS}:
                policy_items.append(item)
            elif any(
                policy_key.lower() in normalized_key
                for policy_key in POLICY_KEYS
            ):
                policy_items.append(item)
            elif normalized_key in {k.lower() for k in SUMMARY_KEYS}:
                summary_items.append(item)
            elif any(
                summary_key.lower() in normalized_key
                for summary_key in SUMMARY_KEYS
            ):
                summary_items.append(item)
            elif normalized_key in {k.lower() for k in REPORT_INFO_KEYS}:
                report_info_items.append(item)
            elif any(
                report_key.lower() in normalized_key
                for report_key in REPORT_INFO_KEYS
            ):
                report_info_items.append(item)
            else:
                other_items.append(item)
                logger.debug(f"[StructuredOrganizer] Unknown key category: '{key}' -> Other")

        # Build sections
        sections = {}

        # 1. Claims: Build row-based claim objects using line numbers
        if claim_items:
            claims = self._build_claims(claim_items)
            if claims:
                sections["Claims"] = claims

        # 2. Policy Info: Flat object with field-level line numbers
        if policy_items:
            policy_info = self._build_flat_section(policy_items)
            if policy_info:
                sections["Policy Info"] = policy_info

        # 3. Summary: Flat object with field-level line numbers
        if summary_items:
            summary = self._build_flat_section(summary_items)
            if summary:
                sections["Summary"] = summary

        # 4. Report Info: Flat object with field-level line numbers
        if report_info_items:
            report_info = self._build_flat_section(report_info_items)
            if report_info:
                sections["Report Info"] = report_info

        # 5. Other: Flat object for uncategorized items
        if other_items:
            other = self._build_flat_section(other_items)
            if other:
                sections["Other"] = other

        return {"sections": sections}

    def _build_claims(
        self, claim_items: List[Dict[str, Any]]
    ) -> List[Dict[str, Dict[str, Any]]]:
        """
        Build row-based claim objects using line number proximity.
        
        Algorithm:
        1. Sort all claim items by their first line number
        2. A new claim starts when a "Claim Number" item appears
        3. Attach nearby fields to the closest Claim Number below it
        
        Returns list of claim objects, each with field-level line numbers.
        """
        if not claim_items:
            return []

        # Find all "Claim Number" items (these are claim anchors)
        claim_number_items = [
            item
            for item in claim_items
            if self._is_claim_number_key(item.get("key", ""))
        ]

        if not claim_number_items:
            logger.warning("[StructuredOrganizer] No Claim Number items found, cannot build claims")
            return []

        # Sort claim numbers by their first line number
        claim_number_items.sort(
            key=lambda x: min(x.get("line_numbers", [999999]) or [999999])
        )

        claims = []

        for idx, claim_num_item in enumerate(claim_number_items):
            claim_num_lines = claim_num_item.get("line_numbers", [])
            if not claim_num_lines:
                continue

            # Define claim window: from this claim number to next claim number (or end)
            claim_start_line = min(claim_num_lines)
            if idx + 1 < len(claim_number_items):
                next_claim_num_lines = claim_number_items[idx + 1].get("line_numbers", [])
                if next_claim_num_lines:
                    claim_end_line = min(next_claim_num_lines)
                else:
                    claim_end_line = 999999
            else:
                claim_end_line = 999999

            # Build claim object: start with Claim Number
            claim: Dict[str, Dict[str, Any]] = {
                "Claim Number": {
                    "value": claim_num_item.get("value", ""),
                    "line_numbers": claim_num_item.get("line_numbers", []),
                }
            }

            # Find other claim fields that fall within this claim's window
            for item in claim_items:
                # Skip if this is the claim number item we're already using
                if item == claim_num_item:
                    continue

                item_lines = item.get("line_numbers", [])
                if not item_lines:
                    continue

                # Field belongs to this claim if ALL its lines are within the window
                min_item_line = min(item_lines)
                max_item_line = max(item_lines)

                # STRICT WINDOW CHECK: All lines must be within window
                if claim_start_line <= min_item_line < claim_end_line and max_item_line < claim_end_line:
                    # Field is within this claim's window
                    key = item.get("key", "").strip().rstrip(":")
                    # Use original key, preserve exact line numbers
                    claim[key] = {
                        "value": item.get("value", ""),
                        "line_numbers": item.get("line_numbers", []),  # Preserve exact line numbers
                    }

            if len(claim) > 1:  # More than just Claim Number
                claims.append(claim)

        return claims

    def _is_claim_number_key(self, key: str) -> bool:
        """Check if a key represents a claim number."""
        normalized = key.strip().rstrip(":").lower()
        return (
            normalized == "claim number"
            or normalized == "claim #"
            or normalized.startswith("claim number")
        )

    def _build_flat_section(
        self, items: List[Dict[str, Any]]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Build a flat section object with field-level line numbers.
        
        Returns:
            {
                "Field Name": {
                    "value": "...",
                    "line_numbers": [NN, NN+1]
                },
                ...
            }
        """
        section = {}

        for item in items:
            key = item.get("key", "").strip().rstrip(":")
            if not key:
                continue

            # Preserve exact line numbers - never modify
            section[key] = {
                "value": item.get("value", ""),
                "line_numbers": item.get("line_numbers", []),
            }

        return section


# Singleton instance
structured_organizer = StructuredOrganizer()

