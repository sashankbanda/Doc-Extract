"""
Semantic tagging service for extracted items.

Adds deterministic semantic_type tags to items using static dictionaries.
No AI, no inference, no grouping - just dictionary lookups.
"""

from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

# Static semantic type mappings
# Maps normalized key patterns to semantic types
SEMANTIC_TYPE_MAPPINGS: Dict[str, str] = {
    # Claim number variations
    "claim.number": ["claim number", "claim #", "claim no", "file number"],
    # Claimant variations
    "claim.claimant": ["claimant", "claimant name", "injured worker"],
    # Policy number variations
    "policy.number": ["policy number", "policy #", "policy no"],
    # Report run date variations
    "report.run_date": ["run date", "report date", "as of date", "run as of"],
    # Unknown (fallback)
    "unknown": [],  # Will be used for unmatched items
}

# Additional mappings for common field patterns
ADDITIONAL_MAPPINGS: Dict[str, str] = {
    "date of loss": "claim.date_of_loss",
    "loss date": "claim.date_of_loss",
    "accident date": "claim.date_of_loss",
    "occurrence date": "claim.date_of_loss",
    "reported date": "claim.reported_date",
    "notification date": "claim.reported_date",
    "date reported": "claim.reported_date",
    "report date": "claim.reported_date",
    "claim status": "claim.status",
    "status": "claim.status",
    "open/closed": "claim.status",
    "total paid": "claim.total_paid",
    "paid": "claim.paid",
    "paid loss": "claim.paid",
    "paid alae": "claim.paid_alae",
    "total incurred": "claim.total_incurred",
    "incurred loss": "claim.total_incurred",
    "total reserves": "claim.total_reserves",
    "outstanding": "claim.total_reserves",
    "loss description": "claim.description",
    "description": "claim.description",
    "accident description": "claim.description",
    "claim description": "claim.description",
    "coverage": "claim.coverage",
    "coverage section": "claim.coverage",
    "cov section": "claim.coverage",
    "lob": "claim.coverage",
    "div": "claim.coverage",
    "cause of loss": "claim.cause_of_loss",
    "cause": "claim.cause_of_loss",
    "insured": "policy.insured",
    "insured name": "policy.insured",
    "insured(s)": "policy.insured",
    "policyholder": "policy.insured",
    "effective date": "policy.effective_date",
    "expiration date": "policy.expiration_date",
    "policy period": "policy.period",
    "total claims": "summary.total_claims",
    "total # claims": "summary.total_claims",
    "totals": "summary.totals",
}


def tag_semantic_type(key: str) -> str:
    """
    Tag an item with a semantic type based on its key.
    
    Args:
        key: The item's key (field label)
        
    Returns:
        Semantic type string (e.g., "claim.number", "policy.number", "unknown")
    """
    if not key or key == "(no key)":
        return "unknown"
    
    # Normalize key for matching
    normalized = key.strip().lower().rstrip(":")
    
    # Remove common punctuation
    normalized = normalized.replace(".", "").replace(",", "").replace("-", " ").replace("_", " ")
    # Collapse whitespace
    normalized = " ".join(normalized.split())
    
    # Check exact matches first
    if normalized in ADDITIONAL_MAPPINGS:
        return ADDITIONAL_MAPPINGS[normalized]
    
    # Check substring matches in additional mappings
    for pattern, semantic_type in ADDITIONAL_MAPPINGS.items():
        if pattern in normalized or normalized in pattern:
            return semantic_type
    
    # Check primary mappings
    for semantic_type, patterns in SEMANTIC_TYPE_MAPPINGS.items():
        for pattern in patterns:
            if pattern in normalized or normalized.startswith(pattern):
                return semantic_type
    
    # Check if it contains key terms
    if "claim" in normalized and "number" in normalized:
        return "claim.number"
    if "claimant" in normalized:
        return "claim.claimant"
    if "policy" in normalized and "number" in normalized:
        return "policy.number"
    if ("run" in normalized or "report" in normalized) and "date" in normalized:
        return "report.run_date"
    
    # Default to unknown
    return "unknown"


def tag_items(items: List[Dict]) -> List[Dict]:
    """
    Add semantic_type to all items in the list.
    
    Args:
        items: List of items with {source_key, value, line_numbers} (or {key, value, line_numbers} for backward compatibility)
        
    Returns:
        List of items with added semantic_type field
    """
    tagged_items = []
    
    for item in items:
        # Support both "key" (old format) and "source_key" (new format) for backward compatibility
        key = item.get("source_key", item.get("key", ""))
        semantic_type = tag_semantic_type(key)
        
        tagged_item = {
            **item,
            "semantic_type": semantic_type
        }
        
        tagged_items.append(tagged_item)
    
    return tagged_items


# Singleton instance
semantic_tagger = type('SemanticTagger', (), {
    'tag_items': staticmethod(tag_items),
    'tag_semantic_type': staticmethod(tag_semantic_type),
})()

