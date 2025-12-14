"""
Semantic grouping service for organizing normalized fields into UI-friendly sections.

Groups fields into logical sections like policy_info, insured_info, claim_header, etc.
"""

from typing import Dict, List, Any, Optional, Tuple
import logging
from collections import Counter

from backend.config import config
from backend.services.metadata_service import StandardizedMetadata

logger = logging.getLogger(__name__)


# Field to group mapping
# Each canonical field belongs to exactly one semantic group (no overlap)
FIELD_GROUPS: Dict[str, str] = {
    # Policy information
    "policyNumber": "policy_info",
    "policyNumberHeader": "policy_info",
    "runDate": "policy_info",
    
    # Insured information
    "insured": "insured_info",
    
    # Claim header fields (appear once per claim)
    "claimNumber": "claim_header",
    "dateOfLoss": "claim_header",
    "reportedDate": "claim_header",
    "claimStatus": "claim_header",
    
    # Claim parties
    "claimant": "claim_parties",
    
    # Financials (primary group for financial fields)
    "totalPaid": "financials",
    "paidAlae": "financials",
    "totalIncurred": "financials",
    "totalReserves": "financials",
    
    # Claim details
    "lossDescription": "claim_details",
    "coverageSection": "claim_details",
    "causeOfLoss": "claim_details",
}


class GroupingService:
    """
    Service for grouping normalized fields into semantic sections.
    """
    
    def group_fields(
        self, 
        normalized_fields: Dict[str, List[Dict[str, Any]]],
        standardized_metadata: Optional[List[Optional[StandardizedMetadata]]] = None
    ) -> Dict[str, Any]:
        """
        Group normalized fields into semantic sections and assemble claims.
        
        Args:
            normalized_fields: Dictionary mapping canonical keys to field lists
            standardized_metadata: Optional standardized metadata for page-aware claim windows
            
        Returns:
            Dictionary with:
            - "groups": semantic groups (for new structure)
            - "report_info": report-level fields (for backward compatibility)
            - "claims": array of claim objects (for backward compatibility)
            - "policy_period_summary": policy period data (for backward compatibility)
            - "_claim_warnings": internal warnings
        """
        # Build semantic groups
        groups: Dict[str, Dict[str, Any]] = {
            "policy_info": {},
            "insured_info": {},
            "claim_header": {},
            "claim_parties": {},
            "dates": {},
            "financials": {},
            "totals": {},
            "claim_details": {},
        }
        
        # Separate report-level fields from claim-level fields
        report_info: Dict[str, Any] = {}
        claim_fields: Dict[str, List[Dict[str, Any]]] = {}
        
        # Fields that belong to report_info (appear once)
        report_level_fields = {"insured", "runDate", "policyNumberHeader", "policyNumber"}
        
        for canonical_key, field_list in normalized_fields.items():
            # Get primary group for this field
            primary_group = FIELD_GROUPS.get(canonical_key)
            
            # For report-level fields: collect unique values (don't merge all into one string)
            # For other fields: merge multiline values but keep distinct occurrences separate
            if canonical_key in report_level_fields:
                # Report-level fields: collect unique values as array with line tracking
                unique_data = self._collect_unique_values_with_lines(field_list)
                if unique_data:
                    # If only one unique value, use it directly; otherwise use array
                    if len(unique_data) == 1:
                        merged_value = unique_data[0]["value"]
                        # Store line refs for single value (as list for consistency)
                        report_info[f"_{canonical_key}_line_refs"] = unique_data[0]["lines"]
                    else:
                        # Array of values - store both values and line refs
                        merged_value = [item["value"] for item in unique_data]
                        # Store line refs per index for _source_refs generation
                        report_info[f"_{canonical_key}_line_refs"] = {
                            idx: item["lines"] for idx, item in enumerate(unique_data)
                        }
                else:
                    merged_value = None
            else:
                # For claim-level and other fields: merge multiline values
                merged_value = self._merge_field_values(field_list)
            
            if primary_group and primary_group in groups:
                groups[primary_group][canonical_key] = merged_value
            else:
                # Default to claim_details if no group specified
                logger.warning(f"[GroupingService] No group found for field '{canonical_key}', defaulting to claim_details")
                if "claim_details" not in groups:
                    groups["claim_details"] = {}
                groups["claim_details"][canonical_key] = merged_value
            
            # Also populate backward-compatible structure
            if canonical_key in report_level_fields:
                report_info[canonical_key] = merged_value
            else:
                # Claim-level field - keep all instances for claim assembly
                claim_fields[canonical_key] = field_list
        
        # Detect header/footer noise (lines repeated on multiple pages)
        ignored_lines = self._detect_noise_lines(normalized_fields, standardized_metadata)
        
        # Assemble claims from claim-level fields using page-aware deterministic windows
        claims, claim_warnings, assignment_traces = self._assemble_claims(
            claim_fields, standardized_metadata, ignored_lines
        )
        
        # Remove empty groups
        clean_groups = {k: v for k, v in groups.items() if v}
        
        return {
            "groups": clean_groups,
            "report_info": report_info,
            "claims": claims,
            "policy_period_summary": {
                "periods": []  # TODO: Extract from raw fields if present
            },
            "_claim_warnings": claim_warnings,  # Internal: warnings for diagnostics
            "_assignment_traces": assignment_traces,  # Internal: why fields were assigned
            "_ignored_lines": ignored_lines,  # Internal: header/footer noise lines
        }
    
    def _detect_noise_lines(
        self,
        normalized_fields: Dict[str, List[Dict[str, Any]]],
        standardized_metadata: Optional[List[Optional[StandardizedMetadata]]]
    ) -> List[int]:
        """
        Detect header/footer noise: lines that appear on multiple pages.
        
        Repeated headers like "Loss Run Report", column headers, and page footers
        can get extracted as fields. This function identifies such lines.
        
        Strategy:
        - Look for fields with the same value appearing on different pages
        - Mark those line numbers as ignored
        
        Returns list of line numbers to ignore.
        """
        if not standardized_metadata:
            return []
        
        ignored_lines: List[int] = []
        
        # Track value -> list of (line_num, page) pairs
        value_to_locations: Dict[str, List[Tuple[int, int]]] = {}
        
        for canonical_key, field_list in normalized_fields.items():
            for field in field_list:
                value = str(field.get("value", "")).strip()
                if not value or len(value) < 3:  # Skip very short values
                    continue
                
                field_lines = field.get("lines", [])
                if not isinstance(field_lines, list):
                    continue
                
                for line_val in field_lines:
                    line_num = self._convert_line_number(line_val)
                    if line_num is None:
                        continue
                    if line_num >= len(standardized_metadata):
                        continue
                    
                    std_meta = standardized_metadata[line_num]
                    if std_meta is None:
                        continue
                    
                    page = std_meta.page
                    
                    if value not in value_to_locations:
                        value_to_locations[value] = []
                    value_to_locations[value].append((line_num, page))
        
        # Find values that appear on 3+ different pages (likely header/footer)
        for value, locations in value_to_locations.items():
            if len(locations) < 3:  # Need at least 3 occurrences
                continue
            
            pages = set(page for _, page in locations)
            if len(pages) >= 3:  # Appears on 3+ different pages
                # This is likely noise - mark all lines as ignored
                for line_num, _ in locations:
                    if line_num not in ignored_lines:
                        ignored_lines.append(line_num)
                logger.info(
                    f"[GroupingService] Detected noise: value '{value[:50]}...' appears on {len(pages)} pages, "
                    f"marking {len(locations)} lines as ignored"
                )
        
        return sorted(ignored_lines)
    
    def _assemble_claims(
        self, 
        claim_fields: Dict[str, List[Dict[str, Any]]],
        standardized_metadata: Optional[List[Optional[StandardizedMetadata]]] = None,
        ignored_lines: Optional[List[int]] = None
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Assemble claim objects from claim-level fields using page-aware deterministic claim windows.
        
        Strategy:
        - Use claimNumber as the hard anchor for each claim
        - Define a strict claim window: from claimNumber line until the next claimNumber line
        - PAGE-AWARE: Fields on different pages must only attach if:
          * page difference ≤ 1 (adjacent pages)
          * AND vertical distance is reasonable (within claim window)
        - Only include fields whose lines fall inside that window
        - Track line numbers per field per claim for accurate source refs
        - Track assignment reasons for diagnostics
        
        Returns:
            - List of claim objects (each with _line_refs internally)
            - List of claim grouping warnings
            - List of assignment traces (why each field was assigned)
        """
        if not claim_fields:
            return [], [], []
        
        warnings: List[Dict[str, Any]] = []
        assignment_traces: List[Dict[str, Any]] = []
        
        if ignored_lines is None:
            ignored_lines = []
        
        # Get all claim numbers and their line numbers
        claim_numbers = claim_fields.get("claimNumber", [])
        if not claim_numbers:
            # No claim numbers - create a single claim with all fields
            claim: Dict[str, Any] = {
                "_line_refs": {}  # Internal tracking of line numbers per field
            }
            for key, field_list in claim_fields.items():
                merged = self._merge_field_values(field_list)
                if merged:
                    claim[key] = merged
                    # Collect all line numbers for this field
                    all_lines = []
                    for field in field_list:
                        lines = field.get("lines", [])
                        if isinstance(lines, list):
                            for line_val in lines:
                                converted = self._convert_line_number(line_val)
                                if converted is not None:
                                    all_lines.append(converted)
                    if all_lines:
                        claim["_line_refs"][key] = sorted(list(set(all_lines)))
            return [claim] if len(claim) > 1 else [], warnings, []
        
        # Sort claim numbers by their first line number to establish order
        def get_first_line(field: Dict[str, Any]) -> int:
            lines = field.get("lines", [])
            if lines and isinstance(lines, list) and len(lines) > 0:
                first_line = lines[0]
                if isinstance(first_line, int):
                    return first_line
            return 999999
        
        sorted_claim_numbers = sorted(claim_numbers, key=get_first_line)
        
        # Build claim windows: each claim spans from its claimNumber to the next claimNumber
        claims: List[Dict[str, Any]] = []
        
        for idx, claim_num_field in enumerate(sorted_claim_numbers):
            claim_num_lines = claim_num_field.get("lines", [])
            if not claim_num_lines or not isinstance(claim_num_lines, list):
                continue
            
            # Get the first line number of this claim (the anchor)
            valid_claim_lines = [l for l in claim_num_lines if isinstance(l, int) and l >= 0]
            if not valid_claim_lines:
                logger.warning(f"[GroupingService] Claim number field has no valid line numbers, skipping")
                continue
            first_claim_line = min(valid_claim_lines)
            if first_claim_line == 999999:
                continue
            
            # PAGE-AWARE LOGIC: Get page number of claim anchor
            # This is critical for multi-page claim tables where headers repeat
            claim_anchor_page = None
            if standardized_metadata and first_claim_line < len(standardized_metadata):
                claim_meta = standardized_metadata[first_claim_line]
                if claim_meta:
                    claim_anchor_page = claim_meta.page
            
            # CLAIM WINDOW LOGIC:
            # Define a strict claim window: from this claimNumber line until the next claimNumber line.
            # This ensures deterministic grouping - each field is assigned to exactly one claim
            # based on which claim window its line numbers fall into.
            # 
            # Window boundaries:
            # - Start: first line number of this claim's claimNumber
            # - End: first line number of next claim's claimNumber (or end of document if last claim)
            if idx + 1 < len(sorted_claim_numbers):
                next_claim_num_field = sorted_claim_numbers[idx + 1]
                next_claim_lines = next_claim_num_field.get("lines", [])
                if next_claim_lines and isinstance(next_claim_lines, list):
                    # Convert line numbers for next claim
                    valid_next_lines = []
                    for line_val in next_claim_lines:
                        converted = self._convert_line_number(line_val)
                        if converted is not None:
                            valid_next_lines.append(converted)
                    if valid_next_lines:
                        next_claim_first_line = min(valid_next_lines)
                        window_end = next_claim_first_line  # EXCLUSIVE boundary
                    else:
                        window_end = 999999  # No valid lines, window extends to end
                else:
                    window_end = 999999  # No next claim, window extends to end
            else:
                window_end = 999999  # Last claim, window extends to end
            
            # Create claim object with internal line refs tracking
            claim: Dict[str, Any] = {
                "claimNumber": claim_num_field.get("value"),
                "_line_refs": {
                    "claimNumber": sorted(list(set([
                        self._convert_line_number(l) 
                        for l in claim_num_lines 
                        if self._convert_line_number(l) is not None
                    ])))
                }
            }
            
            # Find fields that fall within this claim's window
            for key, field_list in claim_fields.items():
                if key == "claimNumber":
                    continue
                
                # Collect fields that fall within the claim window
                matching_fields = []
                field_lines_for_claim = []
                
                for field in field_list:
                    field_lines = field.get("lines", [])
                    if not isinstance(field_lines, list):
                        continue
                    
                    # CLAIM WINDOW ASSIGNMENT (PAGE-AWARE):
                    # A field belongs to this claim if ANY of its line numbers fall within the claim window.
                    # This handles multiline fields that may span across the window boundary.
                    # 
                    # Inclusion rules (all must be satisfied):
                    # 1. Line-based: Field starts before window end AND ends at or after window start
                    # 2. Page-aware: If field is on different page, page difference ≤ 1 AND within window
                    # 
                    # This ensures fields that overlap the window are included, while fields
                    # completely outside the window are excluded. Page awareness prevents
                    # fields from distant pages (e.g., page 1 vs page 5) from being incorrectly assigned.
                    # Convert line numbers (handles hex strings, floats, etc.)
                    field_line_nums = []
                    for line_val in field_lines:
                        converted = self._convert_line_number(line_val)
                        if converted is not None:
                            field_line_nums.append(converted)
                    if not field_line_nums:
                        continue
                    
                    # Skip fields on ignored lines (header/footer noise)
                    if any(line in ignored_lines for line in field_line_nums):
                        continue
                    
                    min_field_line = min(field_line_nums)
                    max_field_line = max(field_line_nums)
                    
                    # Check page constraints if metadata available
                    field_pages = set()
                    if standardized_metadata:
                        for line_num in field_line_nums:
                            if line_num < len(standardized_metadata):
                                field_meta = standardized_metadata[line_num]
                                if field_meta:
                                    field_pages.add(field_meta.page)
                    
                    # PAGE-AWARE CHECK:
                    # If claim anchor has a page and field has pages, check page difference
                    page_ok = True
                    distance = abs(min_field_line - first_claim_line)
                    rule_used = "window"
                    page_diff = 0  # Default value
                    
                    if claim_anchor_page is not None and field_pages and len(field_pages) > 0:
                        # Safe min/max - field_pages is a set, and we've verified it's not empty
                        field_min_page = min(field_pages)
                        field_max_page = max(field_pages)
                        page_diff = min(
                            abs(field_min_page - claim_anchor_page),
                            abs(field_max_page - claim_anchor_page)
                        )
                        
                        # Page constraint: difference must be ≤ 1 (adjacent pages only)
                        if page_diff > 1:
                            page_ok = False
                            rule_used = "page_too_far"
                            warnings.append({
                                "claimNumber": claim_num_field.get("value"),
                                "field": key,
                                "reason": f"page difference too large (claim page {claim_anchor_page}, field page {field_min_page}, diff {page_diff})",
                                "field_value": field.get("value"),
                            })
                            logger.warning(
                                f"[GroupingService] Field '{key}' on page {field_min_page} too far from claim "
                                f"{claim_num_field.get('value')} on page {claim_anchor_page}"
                            )
                    
                    # STRICT LINE-BASED WINDOW CHECK:
                    # A field belongs to this claim ONLY if ALL its line numbers are within the window.
                    # This prevents fields from the next claim from being included.
                    # 
                    # Rules:
                    # 1. ALL field lines must be >= first_claim_line (field starts at or after claim start)
                    # 2. ALL field lines must be < window_end (field ends before next claim starts)
                    # 
                    # This ensures that if a field has ANY line at or after window_end, it belongs to the next claim.
                    all_lines_in_window = (
                        min_field_line >= first_claim_line and 
                        max_field_line < window_end
                    )
                    
                    # Field is assigned if both line and page constraints are satisfied
                    if all_lines_in_window and page_ok:
                        matching_fields.append(field)
                        field_lines_for_claim.extend(field_line_nums)
                        
                        # Track assignment reason for diagnostics
                        assignment_traces.append({
                            "claimNumber": claim_num_field.get("value"),
                            "field": key,
                            "rule": rule_used,
                            "distance": distance,
                            "page_diff": page_diff,  # Use the already-calculated value
                        })
                    elif not all_lines_in_window and min_field_line >= window_end:
                        # Field is outside window (after this claim) - log warning for diagnostics
                        warnings.append({
                            "claimNumber": claim_num_field.get("value"),
                            "field": key,
                            "reason": f"outside claim window (field line {min_field_line} >= window end {window_end})",
                            "field_value": field.get("value"),
                        })
                        logger.warning(
                            f"[GroupingService] Field '{key}' (line {min_field_line}) outside claim window "
                            f"for claim {claim_num_field.get('value')} (window: {first_claim_line}-{window_end})"
                        )
                
                if matching_fields:
                    # IMPORTANT: For claim-level fields, we should NOT merge multiple distinct values.
                    # Each claim should have ONE value per field. If multiple fields match, we need to
                    # determine which one belongs to this claim.
                    # 
                    # Strategy: Use the field that is closest to the claim anchor (first claimNumber line)
                    # This handles cases where the same field label appears multiple times in the document.
                    if len(matching_fields) == 1:
                        # Single field - use it directly
                        claim[key] = matching_fields[0].get("value")
                        claim["_line_refs"][key] = sorted(list(set(field_lines_for_claim)))
                    else:
                        # Multiple fields match - choose the one closest to claim anchor
                        # Sort by distance from claim anchor (first line of field vs first line of claim)
                        def get_distance_to_claim(field: Dict[str, Any]) -> int:
                            field_lines = field.get("lines", [])
                            if not field_lines:
                                return 999999
                            converted_lines = []
                            for line_val in field_lines:
                                converted = self._convert_line_number(line_val)
                                if converted is not None:
                                    converted_lines.append(converted)
                            if not converted_lines:
                                return 999999
                            min_field_line = min(converted_lines)
                            return abs(min_field_line - first_claim_line)
                        
                        # Sort by distance and take the closest one
                        sorted_by_distance = sorted(matching_fields, key=get_distance_to_claim)
                        closest_field = sorted_by_distance[0]
                        claim[key] = closest_field.get("value")
                        
                        # Store line numbers for the closest field only
                        closest_field_lines = closest_field.get("lines", [])
                        closest_converted = []
                        for line_val in closest_field_lines:
                            converted = self._convert_line_number(line_val)
                            if converted is not None:
                                closest_converted.append(converted)
                        claim["_line_refs"][key] = sorted(list(set(closest_converted)))
            
            if len(claim) > 2:  # More than just claimNumber and _line_refs
                claims.append(claim)
        
        return claims, warnings, assignment_traces
    
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
    
    def _collect_unique_values_with_lines(self, field_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Collect unique values from field list with their line numbers (for report-level fields).
        
        This prevents merging distinct values into one string.
        Returns list of dicts with "value" and "lines" keys.
        """
        if not field_list:
            return []
        
        unique_data = []
        seen = set()
        
        for field in field_list:
            value = field.get("value")
            if value is not None and value != "":
                value_str = str(value).strip()
                if value_str and value_str not in seen:
                    seen.add(value_str)
                    # Collect all line numbers for this value, converting hex strings
                    field_lines = field.get("lines", [])
                    valid_lines = []
                    for line_val in field_lines:
                        converted = self._convert_line_number(line_val)
                        if converted is not None:
                            valid_lines.append(converted)
                    
                    unique_data.append({
                        "value": value_str,
                        "lines": sorted(list(set(valid_lines))) if valid_lines else []
                    })
        
        return unique_data
    
    def _merge_field_values(self, field_list: List[Dict[str, Any]]) -> Any:
        """
        Merge multiple field values (for multiline fields).
        
        Backend-controlled merging: combines values in line order (reading order).
        Sorts field fragments by their first line number before merging.
        
        This is used for fields that span multiple lines within the same context.
        For distinct occurrences, use _collect_unique_values() instead.
        """
        if not field_list:
            return None
        
        if len(field_list) == 1:
            return field_list[0].get("value")
        
        # Sort by first line number to ensure reading order
        # Fields with no lines go to the end
        def get_first_line(field: Dict[str, Any]) -> int:
            lines = field.get("lines", [])
            if lines and isinstance(lines, list) and len(lines) > 0:
                first_line = self._convert_line_number(lines[0])
                if first_line is not None:
                    return first_line
            return 999999  # Put fields without lines at the end
        
        sorted_fields = sorted(field_list, key=get_first_line)
        
        # Merge values in line order with space
        values = [f.get("value", "") for f in sorted_fields if f.get("value")]
        merged_value = " ".join(str(v) for v in values if v)
        
        return merged_value if merged_value else None


grouping_service = GroupingService()

