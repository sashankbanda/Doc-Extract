"""
Backend-controlled field normalization service.

Maps raw field labels from LLM extraction to canonical keys using synonym dictionaries.
This ensures deterministic, reusable normalization that never relies on the LLM.
"""

from typing import Dict, List, Optional, Tuple
import logging
import re

logger = logging.getLogger(__name__)


# Synonym dictionaries: maps raw labels (case-insensitive) to canonical keys
FIELD_SYNONYMS: Dict[str, str] = {
    # Claim number variations
    "claim no": "claimNumber",
    "claim #": "claimNumber",
    "file number": "claimNumber",
    "claim number": "claimNumber",
    
    # Policy number variations
    "policy no": "policyNumber",
    "policy #": "policyNumber",
    "policy number": "policyNumber",
    
    # Claimant variations
    "claimant name": "claimant",
    "injured worker": "claimant",
    "claimant": "claimant",
    
    # Date of loss variations
    "loss date": "dateOfLoss",
    "accident date": "dateOfLoss",
    "occurrence date": "dateOfLoss",
    "date of loss": "dateOfLoss",
    
    # Reported date variations
    "notification date": "reportedDate",
    "date reported": "reportedDate",
    "report date": "reportedDate",
    "reported date": "reportedDate",
    
    # Claim status variations
    "status": "claimStatus",
    "open/closed": "claimStatus",
    "claim status": "claimStatus",
    
    # Loss description variations
    "description": "lossDescription",
    "accident description": "lossDescription",
    "desc": "lossDescription",
    "loss description": "lossDescription",
    
    # Coverage section variations
    "coverage": "coverageSection",
    "cov section": "coverageSection",
    "lob": "coverageSection",
    "div": "coverageSection",
    "coverage section": "coverageSection",
    
    # Cause of loss variations
    "cause": "causeOfLoss",
    "cause description": "causeOfLoss",
    "injury code": "causeOfLoss",
    "cause of loss": "causeOfLoss",
    
    # Financial field variations
    "total paid": "totalPaid",
    "gross paid": "totalPaid",
    "total gross incurred": "totalPaid",
    
    "paid alae": "paidAlae",
    "paid expense": "paidAlae",
    "legal paid": "paidAlae",
    
    "total incurred": "totalIncurred",
    "incurred loss": "totalIncurred",
    
    "total reserves": "totalReserves",
    "outstanding": "totalReserves",
    
    # Report info variations
    "insured": "insured",
    "insured(s)": "insured",
    "insured name": "insured",
    "policyholder": "insured",
    
    "run date": "runDate",
    "report date": "runDate",
    
    "policy number header": "policyNumberHeader",
    "policy number": "policyNumberHeader",  # Context-dependent, may need refinement
}


def normalize_field_label(raw_label: str) -> Tuple[Optional[str], float, str]:
    """
    Normalize a raw field label to a canonical key with partial matching support.
    
    Handles variations like:
    - "Claim Number :" -> "claimNumber"
    - "Policy No." -> "policyNumber"
    - "Total Paid (USD)" -> "totalPaid"
    
    Args:
        raw_label: The raw label extracted by the LLM (e.g., "Claimant Name")
        
    Returns:
        Tuple of (canonical_key, confidence_score, match_type)
        - canonical_key: Canonical key (e.g., "claimant") or None if no match found
        - confidence_score: Confidence 0-1 (1.0 = exact match, 0.8 = partial, 0.6 = contains)
        - match_type: "exact", "partial", "contains", or "none"
    """
    if not raw_label:
        return None, 0.0, "none"
    
    # Step 1: Basic normalization - lowercase, strip whitespace
    normalized = raw_label.lower().strip()
    original_normalized = normalized
    
    # Step 2: Remove parenthetical text (e.g., "(USD)", "(per claim)")
    normalized = re.sub(r'\([^)]*\)', '', normalized).strip()
    
    # Step 3: Collapse whitespace (multiple spaces to single space)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    
    # Step 4: Remove punctuation (colons, periods, dashes, etc.)
    normalized = re.sub(r'[:;.,\-_]+', ' ', normalized).strip()
    normalized = re.sub(r'\s+', ' ', normalized).strip()  # Collapse again after punctuation removal
    
    # Step 5: Direct lookup (exact match - highest confidence)
    canonical = FIELD_SYNONYMS.get(normalized)
    if canonical:
        return canonical, 1.0, "exact"
    
    # Step 6: Try startswith matching for common patterns (partial match - medium confidence)
    # This handles cases like "Claim Number :" where punctuation/whitespace varies
    for synonym, canonical_key in FIELD_SYNONYMS.items():
        # Check if normalized starts with synonym (handles trailing punctuation)
        if normalized.startswith(synonym):
            return canonical_key, 0.8, "partial"
        # Check if synonym starts with normalized (handles leading text)
        if synonym.startswith(normalized) and len(normalized) >= 3:  # Minimum 3 chars to avoid false matches
            return canonical_key, 0.8, "partial"
    
    # Step 7: Try contains matching for safe cases (lower confidence)
    # Only for labels that are clearly field names (not generic words)
    if len(normalized) >= 5:  # Only for reasonably long labels
        for synonym, canonical_key in FIELD_SYNONYMS.items():
            # Only match if synonym is substantial (>= 4 chars) to avoid false positives
            if len(synonym) >= 4 and synonym in normalized:
                return canonical_key, 0.6, "contains"
    
    return None, 0.0, "none"


class NormalizationService:
    """
    Service for normalizing raw LLM-extracted fields to canonical keys.
    """
    
    def normalize_fields(
        self, 
        raw_fields: List[Dict[str, any]], 
        ignored_lines: Optional[List[int]] = None
    ) -> Dict[str, List[Dict[str, any]]]:
        """
        Normalize a list of raw fields from LLM extraction.
        
        Args:
            raw_fields: List of raw field objects with "label", "value", "lines"
            ignored_lines: Optional list of line numbers to skip (header/footer noise)
            
        Returns:
            Dictionary mapping canonical keys to lists of normalized field objects.
            Also returns unmapped_fields, field_confidence, and label_collisions for diagnostics.
        """
        normalized: Dict[str, List[Dict[str, any]]] = {}
        unmapped_fields: List[Dict[str, any]] = []
        field_confidence: Dict[str, float] = {}  # Track confidence per canonical field
        label_to_lines: Dict[str, List[List[int]]] = {}  # Track line ranges per label for collision detection
        
        if ignored_lines is None:
            ignored_lines = []
        
        for field in raw_fields:
            raw_label = field.get("label", "")
            field_lines = field.get("lines", [])
            
            # Skip fields on ignored lines (header/footer noise)
            if field_lines and any(line in ignored_lines for line in field_lines if isinstance(line, int)):
                logger.debug(f"[NormalizationService] Skipping field '{raw_label}' on ignored line")
                continue
            
            canonical_key, confidence, match_type = normalize_field_label(raw_label)
            
            if canonical_key:
                if canonical_key not in normalized:
                    normalized[canonical_key] = []
                
                # Track confidence (use highest confidence for this canonical key)
                if canonical_key not in field_confidence or confidence > field_confidence[canonical_key]:
                    field_confidence[canonical_key] = confidence
                
                normalized[canonical_key].append({
                    "value": field.get("value"),
                    "lines": field.get("lines", []),
                    "raw_label": raw_label,  # Keep original for debugging
                    "_confidence": confidence,  # Internal confidence score
                    "_match_type": match_type,  # Internal match type
                })
                
                # Track label-to-lines mapping for collision detection
                if raw_label not in label_to_lines:
                    label_to_lines[raw_label] = []
                if field_lines and isinstance(field_lines, list):
                    valid_lines = [l for l in field_lines if isinstance(l, int) and l >= 0]
                    if valid_lines:
                        label_to_lines[raw_label].append(valid_lines)
            else:
                # Track unmapped fields for diagnostics
                unmapped_fields.append({
                    "label": raw_label,
                    "value": field.get("value"),
                    "lines": field.get("lines", []),
                })
                logger.warning(f"[NormalizationService] Unmapped field: '{raw_label}'")
        
        # Detect label collisions (same label maps to same canonical key but in non-overlapping regions)
        label_collisions = self._detect_label_collisions(label_to_lines, normalized)
        
        return {
            "normalized": normalized,
            "unmapped_fields": unmapped_fields,
            "field_confidence": field_confidence,
            "label_collisions": label_collisions,
        }
    
    def _detect_label_collisions(
        self,
        label_to_lines: Dict[str, List[List[int]]],
        normalized: Dict[str, List[Dict[str, any]]]
    ) -> List[Dict[str, any]]:
        """
        Detect when the same raw label maps to the same canonical key
        but appears in non-overlapping vertical regions (different table sections).
        
        This indicates a collision where the same label has different meanings
        in different parts of the document (e.g., "Total" in header vs footer).
        
        WHY COLLISIONS ARE NOT AUTO-RESOLVED:
        - Context is required to determine which meaning is correct
        - Different table sections may use the same label for different purposes
        - Auto-resolution could incorrectly merge unrelated data
        - Better to detect and report, allowing manual review or future ML-based resolution
        
        Returns list of detected collisions for diagnostics.
        """
        collisions: List[Dict[str, any]] = []
        
        # Build reverse mapping: canonical_key -> list of (raw_label, line_ranges)
        canonical_to_labels: Dict[str, List[Tuple[str, List[List[int]]]]] = {}
        
        for canonical_key, field_list in normalized.items():
            for field in field_list:
                raw_label = field.get("raw_label", "")
                field_lines = field.get("lines", [])
                
                if raw_label and field_lines and isinstance(field_lines, list):
                    valid_lines = [l for l in field_lines if isinstance(l, int) and l >= 0]
                    if valid_lines:
                        if canonical_key not in canonical_to_labels:
                            canonical_to_labels[canonical_key] = []
                        canonical_to_labels[canonical_key].append((raw_label, [valid_lines]))
        
        # Check for collisions: same label, same canonical key, non-overlapping line ranges
        for canonical_key, label_data in canonical_to_labels.items():
            # Group by raw label
            label_groups: Dict[str, List[List[int]]] = {}
            for raw_label, line_ranges in label_data:
                if raw_label not in label_groups:
                    label_groups[raw_label] = []
                label_groups[raw_label].extend(line_ranges)
            
            # For each label that appears multiple times, check if ranges are non-overlapping
            for raw_label, all_ranges in label_groups.items():
                if len(all_ranges) < 2:
                    continue
                
                # Flatten and sort all line numbers
                all_lines = sorted([line for range_list in all_ranges for line in range_list])
                
                # Check if ranges are clearly separated (non-overlapping)
                # A collision exists if there are distinct clusters of lines
                if len(all_lines) >= 2:
                    # Find gaps larger than 50 lines (likely different sections)
                    gaps = []
                    for i in range(len(all_lines) - 1):
                        gap = all_lines[i + 1] - all_lines[i]
                        if gap > 50:  # Threshold for "different section"
                            gaps.append((all_lines[i], all_lines[i + 1], gap))
                    
                    if gaps:
                        # Found distinct regions - this is a collision
                        # Group lines into regions
                        regions = []
                        if all_lines:  # Safety check
                            current_region = [all_lines[0]]
                            for i in range(1, len(all_lines)):
                                if all_lines[i] - all_lines[i-1] > 50:
                                    if current_region:  # Safety check
                                        regions.append([min(current_region), max(current_region)])
                                    current_region = [all_lines[i]]
                                else:
                                    current_region.append(all_lines[i])
                            if current_region:  # Safety check
                                regions.append([min(current_region), max(current_region)])
                        
                        collisions.append({
                            "label": raw_label,
                            "mapped_to": canonical_key,
                            "line_ranges": regions,
                            "reason": f"Same label appears in {len(regions)} distinct regions (gaps > 50 lines)",
                        })
                        logger.warning(
                            f"[NormalizationService] Label collision detected: '{raw_label}' -> '{canonical_key}' "
                            f"in {len(regions)} distinct regions"
                        )
        
        return collisions


normalization_service = NormalizationService()

