import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Canonical field ordering and keys for ST rows
ST_CANONICAL_FIELDS: List[str] = [
    "lob",
    "insured",
    "dba",
    "policyNumber",
    "effdate",
    "expdate",
    "carrier",
    "valuedDate",
    "claimNumber",
    "claimant",
    "claimStatus",
    "closedDate",
    "reportedDate",
    "dateOfLoss",
    "lossDescription",
    "lossLocation",
    "state",
    "city",
    "medicalPaid",
    "medicalPaid2",
    "medicalPaid3",
    "medicalReserves",
    "medicalReserves2",
    "medicalReserves3",
    "indemnityPaid",
    "indemnityPaid2",
    "indemnityPaid3",
    "indemnityPaid4",
    "indemnityPaid5",
    "indemnityPaid6",
    "indemnityReserves",
    "indemnityReserves2",
    "indemnityReserves3",
    "indemnityReserves4",
    "indemnityReserves5",
    "indemnityReserves6",
    "expensesPaid",
    "expensesPaid2",
    "expensesPaid3",
    "expensesPaid4",
    "expensesPaid5",
    "expensesPaid6",
    "expensesReserves",
    "expensesReserves2",
    "expensesReserves3",
    "expensesReserves4",
    "expensesReserves5",
    "expensesReserves6",
    "totalPaid",
    "totalPaid2",
    "totalReserve",
    "totalReserve2",
    "totalIncurredSource",
    "recoveries",
    "recoveries2",
    "recoveries3",
    "recoveries4",
    "recoveries5",
    "recoveries6",
    "totalMedical",
    "totalIndemnity",
    "totalExpenses",
    "inferredCurrency",
    "pageNumber",
    "sheetName",
]


def _empty_field(canonical_name: str) -> Dict[str, Any]:
    """
    Create an empty ST field object. We keep canonical_name so the consumer
    knows which field this placeholder belongs to, but leave value/source_key
    empty and line_numbers empty.
    """
    return {
      "source_key": "",
      "canonical_name": canonical_name,
      "value": "",
      "line_numbers": [],
      "semantic_type": "",
    }


def _init_empty_row() -> Dict[str, Any]:
    """
    Initialize a row object with ALL canonical fields present so that the
    frontend can rely on a stable schema when building tables.
    """
    row: Dict[str, Any] = {}
    for field in ST_CANONICAL_FIELDS:
        row[field] = _empty_field(field)
    return row


def _is_claim_number_item(item: Dict[str, Any]) -> bool:
    canonical = (item.get("canonical_name") or "").strip()
    semantic = (item.get("semantic_type") or "").strip()
    if semantic.startswith("claim.number"):
        return True
    normalized = canonical.lower()
    return normalized == "claimNumber".lower() or normalized == "claimnumber"


def _first_line(item: Dict[str, Any]) -> int:
    nums = item.get("line_numbers") or []
    return min(nums) if nums else 10**9


def _assign_field_to_row(row: Dict[str, Any], base_key: str, item: Dict[str, Any]) -> None:
    """
    Assign an item to the given base_key, using numbered variants (...2,3,4,5,6)
    if the base slot is already occupied (has a non-empty value).
    """
    # if this key is not one of our canonical fields, skip
    if base_key not in row:
        return

    def is_empty_field(field: Dict[str, Any]) -> bool:
        return not field.get("value")

    # First try base key
    current = row[base_key]
    if is_empty_field(current):
        row[base_key] = {
          "source_key": item.get("source_key", ""),
          "canonical_name": item.get("canonical_name") or base_key,
          "value": item.get("value", ""),
          "line_numbers": item.get("line_numbers") or [],
          "semantic_type": item.get("semantic_type", ""),
        }
        return

    # Try numbered variants: baseKey2 ... baseKey6
    for n in range(2, 7):
        numbered = f"{base_key}{n}"
        if numbered in row:
            current = row[numbered]
            if is_empty_field(current):
                row[numbered] = {
                  "source_key": item.get("source_key", ""),
                  "canonical_name": item.get("canonical_name") or base_key,
                  "value": item.get("value", ""),
                  "line_numbers": item.get("line_numbers") or [],
                  "semantic_type": item.get("semantic_type", ""),
                }
                return


def build_st_rows(items: List[Dict[str, Any]], debug: bool = False) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Build ST-style array-of-objects rows from flat tagged items.

    Each row corresponds (roughly) to a claim, defined by a claimNumber anchor
    and a line-number window, and contains all canonical fields as nested
    objects with {source_key, canonical_name, value, line_numbers, semantic_type}.

    This function does NOT drop items; it only assigns those that clearly fall
    into a claim window. Others can still be used elsewhere (e.g. summary).

    Returns:
        Tuple of (rows, debug_info) where debug_info contains validation results
        and tracking data if debug=True, otherwise empty dict.
    """
    debug_info: Dict[str, Any] = {
        "total_items": len(items),
        "claim_anchors_found": 0,
        "rows_created": 0,
        "items_assigned": 0,
        "items_unassigned": [],
        "items_without_canonical": [],
        "items_without_line_numbers": [],
        "validation_issues": [],
        "row_details": [],
    }

    if not items:
        logger.warning("[STBuilder] No items provided")
        return [], debug_info

    # Find claim anchors
    claim_items: List[Dict[str, Any]] = [it for it in items if _is_claim_number_item(it)]
    debug_info["claim_anchors_found"] = len(claim_items)
    
    if debug:
        logger.info(f"[STBuilder] Found {len(claim_items)} claim anchors from {len(items)} total items")
        for idx, anchor in enumerate(claim_items):
            logger.debug(f"[STBuilder] Claim anchor {idx+1}: {anchor.get('value')} at lines {anchor.get('line_numbers')}")

    if not claim_items:
        debug_info["validation_issues"].append("No claim number items found - cannot build ST rows")
        logger.warning("[STBuilder] No claim anchors found")
        return [], debug_info

    # Sort anchors by first line number
    claim_items.sort(key=_first_line)

    rows: List[Dict[str, Any]] = []
    assigned_item_ids = set()

    for i, anchor in enumerate(claim_items):
        start = _first_line(anchor)
        end = _first_line(claim_items[i + 1]) if i + 1 < len(claim_items) else 10**9

        row = _init_empty_row()
        row_debug = {
            "claim_number": anchor.get("value", ""),
            "claim_line": start,
            "window": [start, end],
            "items_in_window": [],
            "items_assigned_to_row": [],
            "items_skipped": [],
        }

        # Always assign the anchor as claimNumber
        _assign_field_to_row(row, "claimNumber", anchor)
        assigned_item_ids.add(id(anchor))
        row_debug["items_assigned_to_row"].append({
            "field": "claimNumber",
            "source_key": anchor.get("source_key"),
            "value": anchor.get("value"),
            "line_numbers": anchor.get("line_numbers"),
        })

        # Now scan all items and assign those fully inside [start, end)
        for item in items:
            if item is anchor:
                continue
            
            item_id = id(item)
            line_nums = item.get("line_numbers") or []
            
            if not line_nums:
                if item_id not in assigned_item_ids:
                    debug_info["items_without_line_numbers"].append({
                        "source_key": item.get("source_key"),
                        "value": item.get("value"),
                        "canonical_name": item.get("canonical_name"),
                    })
                continue
            
            min_l = min(line_nums)
            max_l = max(line_nums)
            
            # Track items in window for debugging
            if min_l >= start and max_l < end:
                row_debug["items_in_window"].append({
                    "source_key": item.get("source_key"),
                    "canonical_name": item.get("canonical_name"),
                    "value": item.get("value", "")[:50],  # Truncate long values
                    "line_numbers": line_nums,
                })
            
            if min_l < start or max_l >= end:
                continue

            canonical = (item.get("canonical_name") or "").strip()
            if not canonical:
                row_debug["items_skipped"].append({
                    "reason": "no_canonical_name",
                    "source_key": item.get("source_key"),
                    "value": item.get("value", "")[:50],
                    "line_numbers": line_nums,
                })
                if item_id not in assigned_item_ids:
                    debug_info["items_without_canonical"].append({
                        "source_key": item.get("source_key"),
                        "value": item.get("value"),
                        "line_numbers": line_nums,
                    })
                continue

            # Many canonical names already match our ST keys (lob, insured, policyNumber, etc.)
            base_key = canonical
            # Defensive: normalize casing
            base_key = base_key[0].lower() + base_key[1:] if base_key else base_key

            # Check if this canonical name maps to a valid ST field
            if base_key not in row:
                row_debug["items_skipped"].append({
                    "reason": f"canonical_name_not_in_st_fields",
                    "canonical_name": canonical,
                    "base_key": base_key,
                    "source_key": item.get("source_key"),
                    "value": item.get("value", "")[:50],
                })
                continue

            old_value = row[base_key].get("value")
            _assign_field_to_row(row, base_key, item)
            new_value = row[base_key].get("value")
            
            if old_value != new_value:
                assigned_item_ids.add(item_id)
                debug_info["items_assigned"] += 1
                row_debug["items_assigned_to_row"].append({
                    "field": base_key,
                    "source_key": item.get("source_key"),
                    "value": item.get("value", "")[:50],
                    "line_numbers": line_nums,
                })

        rows.append(row)
        debug_info["rows_created"] += 1
        if debug:
            debug_info["row_details"].append(row_debug)

    # Find unassigned items
    for item in items:
        if id(item) not in assigned_item_ids:
            debug_info["items_unassigned"].append({
                "source_key": item.get("source_key"),
                "canonical_name": item.get("canonical_name"),
                "value": item.get("value", "")[:50],
                "line_numbers": item.get("line_numbers"),
                "semantic_type": item.get("semantic_type"),
            })

    # Run validation
    validation_issues = validate_st_rows(rows, items)
    debug_info["validation_issues"].extend(validation_issues)

    if debug:
        logger.info(f"[STBuilder] Built {len(rows)} rows, assigned {debug_info['items_assigned']} items, {len(debug_info['items_unassigned'])} unassigned")
        if validation_issues:
            logger.warning(f"[STBuilder] Found {len(validation_issues)} validation issues")

    return rows, debug_info


def validate_st_rows(rows: List[Dict[str, Any]], original_items: List[Dict[str, Any]]) -> List[str]:
    """
    Validate ST rows and return a list of issues found.
    """
    issues = []

    if not rows:
        issues.append("No rows generated")
        return issues

    # Check 1: All rows should have all canonical fields
    for idx, row in enumerate(rows):
        missing_fields = [f for f in ST_CANONICAL_FIELDS if f not in row]
        if missing_fields:
            issues.append(f"Row {idx+1}: Missing fields: {missing_fields}")

    # Check 2: Each row should have at least claimNumber populated
    for idx, row in enumerate(rows):
        claim_num = row.get("claimNumber", {}).get("value", "").strip()
        if not claim_num:
            issues.append(f"Row {idx+1}: claimNumber is empty")

    # Check 3: Check for duplicate claim numbers
    claim_numbers = []
    for idx, row in enumerate(rows):
        claim_num = row.get("claimNumber", {}).get("value", "").strip()
        if claim_num:
            if claim_num in claim_numbers:
                issues.append(f"Row {idx+1}: Duplicate claim number '{claim_num}'")
            claim_numbers.append(claim_num)

    # Check 4: Count how many items were used vs total
    total_items = len(original_items)
    items_with_values = sum(1 for row in rows for field in row.values() if isinstance(field, dict) and field.get("value"))
    if items_with_values < total_items * 0.1:  # Less than 10% of items used
        issues.append(f"Warning: Only {items_with_values} fields populated from {total_items} items (may indicate mapping issues)")

    # Check 5: Check for fields that should be populated but aren't
    common_fields = ["claimant", "dateOfLoss", "lossDescription", "totalPaid"]
    for idx, row in enumerate(rows):
        for field in common_fields:
            field_obj = row.get(field, {})
            if isinstance(field_obj, dict) and not field_obj.get("value"):
                # This is just a warning, not an error
                pass  # Could add to issues if needed

    return issues


