# ST Table Debugging Guide

This guide explains how to track and fix issues in the ST (Structured Table) builder.

## Overview

The ST table builder converts flat `StructuredItem[]` from the LLM into your array-of-objects format (one object per claim row). When issues occur, you can use these debugging tools to identify and fix them.

## Files Generated

After running `/structure/{whisper_hash}`, you get:

1. **`{whisper_hash}_structured.json`** - Flat items array (LLM output)
2. **`{whisper_hash}_st.json`** - ST rows (array of objects per claim)
3. **`{whisper_hash}_st_debug.json`** - Debug information (NEW!)

## Debug Endpoint

### Get Debug Info

```bash
GET /structure/{whisper_hash}/debug
```

Returns detailed debug information including:

- **Total items**: How many items were extracted
- **Claim anchors found**: How many claim numbers were detected
- **Rows created**: How many ST rows were built
- **Items assigned**: How many items were successfully mapped to ST fields
- **Items unassigned**: Items that couldn't be assigned to any row
- **Items without canonical**: Items missing `canonical_name`
- **Items without line numbers**: Items missing `line_numbers`
- **Validation issues**: List of problems found
- **Row details**: Per-row breakdown of what was assigned

## Common Issues and Fixes

### Issue 1: No Rows Generated

**Symptoms:**
- `rows_created: 0`
- `claim_anchors_found: 0`

**Possible Causes:**
- No claim numbers detected in the document
- Claim numbers not properly tagged by semantic_tagger
- `canonical_name` for claim numbers doesn't match "claimNumber"

**Fix:**
1. Check `_structured.json` - look for items with `semantic_type: "claim.number"`
2. Verify claim number detection logic in `_is_claim_number_item()`
3. Check if synonyms in `CANONICAL_MAPPINGS` include your claim number labels

### Issue 2: Many Items Unassigned

**Symptoms:**
- `items_unassigned` list is very long
- `items_assigned` is much smaller than `total_items`

**Possible Causes:**
- Items fall outside claim windows (line numbers don't match)
- Items missing `canonical_name` (can't map to ST fields)
- `canonical_name` doesn't match any ST field names

**Fix:**
1. Check `items_without_canonical` - these need synonym mapping
2. Check `items_without_line_numbers` - these can't be assigned to windows
3. Review `row_details[].items_in_window` vs `items_assigned_to_row` - see what's being skipped
4. Add missing synonyms to `CANONICAL_MAPPINGS` in `llm_service.py`

### Issue 3: Fields Not Populated

**Symptoms:**
- Expected fields (like `claimant`, `dateOfLoss`) are empty in rows
- Items exist in `_structured.json` but don't appear in ST rows

**Possible Causes:**
- Field's `canonical_name` doesn't match ST field name exactly
- Items are in wrong claim window (line numbers off)
- Field name casing mismatch (e.g., `PolicyNumber` vs `policyNumber`)

**Fix:**
1. Check `row_details[].items_in_window` - see what items are in the window
2. Check `row_details[].items_skipped` - see why items were skipped
3. Verify `canonical_name` matches ST field names (case-sensitive after first letter)
4. Check line number windows - items must be fully within `[start, end)`

### Issue 4: Duplicate Claim Numbers

**Symptoms:**
- Validation issue: "Duplicate claim number"
- Same claim appears in multiple rows

**Possible Causes:**
- Multiple items with same claim number value
- Claim windows overlapping

**Fix:**
1. Check claim anchors - verify each anchor has unique line numbers
2. Review claim window logic - ensure windows don't overlap

### Issue 5: Wrong Field Mapping

**Symptoms:**
- Items appear in wrong ST fields
- `source_key` doesn't match expected field

**Possible Causes:**
- Synonym mapping incorrect
- `canonical_name` from LLM doesn't match ST field names
- Case normalization issues

**Fix:**
1. Check `row_details[].items_assigned_to_row` - see what field each item was assigned to
2. Verify `canonical_name` in `_structured.json` matches expected ST field name
3. Update `CANONICAL_MAPPINGS` if synonyms are wrong
4. Check `_assign_field_to_row()` logic - verify base_key normalization

## Step-by-Step Debugging Process

### Step 1: Run Structure Endpoint

```bash
POST /structure/{whisper_hash}
```

This generates all three files automatically.

### Step 2: Check Debug File

```bash
GET /structure/{whisper_hash}/debug
```

Or read directly:
```bash
cat output_files/{whisper_hash}_st_debug.json
```

### Step 3: Review Summary Stats

Look at top-level debug info:
- `total_items` vs `items_assigned` - how much was used?
- `validation_issues` - any obvious problems?
- `claim_anchors_found` - were claims detected?

### Step 4: Examine Unassigned Items

Check `items_unassigned` array:
- Why weren't they assigned?
- Missing `canonical_name`? → Add to synonyms
- Missing `line_numbers`? → Check LLM extraction
- Wrong line numbers? → Check claim windows

### Step 5: Review Per-Row Details

For each row in `row_details`:
- `items_in_window` - what items were in the claim window?
- `items_assigned_to_row` - what actually got assigned?
- `items_skipped` - what was skipped and why?

### Step 6: Compare with Source Data

Compare `_structured.json` with `_st.json`:
- Are important fields missing?
- Are values correct?
- Are line numbers preserved?

### Step 7: Fix Issues

Based on findings:
1. **Add synonyms** → Update `CANONICAL_MAPPINGS` in `llm_service.py`
2. **Fix claim detection** → Update `_is_claim_number_item()` if needed
3. **Adjust windows** → Modify window logic in `build_st_rows()` if line numbers are off
4. **Fix field mapping** → Update `_assign_field_to_row()` normalization if casing issues

### Step 8: Re-run and Verify

After fixes:
1. Re-run `/structure/{whisper_hash}`
2. Check new `_st_debug.json`
3. Verify issues are resolved

## Example Debug Output

```json
{
  "whisper_hash": "abc123",
  "debug_info": {
    "total_items": 150,
    "claim_anchors_found": 5,
    "rows_created": 5,
    "items_assigned": 45,
    "items_unassigned": [
      {
        "source_key": "Policy Effective Date",
        "canonical_name": null,
        "value": "01/01/2024",
        "line_numbers": [3],
        "semantic_type": "policy.effective_date"
      }
    ],
    "items_without_canonical": [
      {
        "source_key": "Policy Effective Date",
        "value": "01/01/2024",
        "line_numbers": [3]
      }
    ],
    "validation_issues": [
      "Warning: Only 45 fields populated from 150 items (may indicate mapping issues)"
    ],
    "row_details": [
      {
        "claim_number": "01000225",
        "claim_line": 15,
        "window": [15, 28],
        "items_in_window": [
          {
            "source_key": "Claimant Name",
            "canonical_name": "claimant",
            "value": "SYDIA",
            "line_numbers": [16, 17]
          }
        ],
        "items_assigned_to_row": [
          {
            "field": "claimNumber",
            "source_key": "Claim Number",
            "value": "01000225",
            "line_numbers": [15]
          },
          {
            "field": "claimant",
            "source_key": "Claimant Name",
            "value": "SYDIA",
            "line_numbers": [16, 17]
          }
        ],
        "items_skipped": [
          {
            "reason": "canonical_name_not_in_st_fields",
            "canonical_name": "unknownField",
            "base_key": "unknownField",
            "source_key": "Some Field",
            "value": "Some Value"
          }
        ]
      }
    ]
  }
}
```

## Quick Reference

### Check if claim numbers are detected:
```python
# In debug_info:
claim_anchors_found > 0  # Should be > 0
```

### Check if items are being assigned:
```python
# In debug_info:
items_assigned / total_items  # Should be > 0.1 (10%+)
```

### Find unmapped fields:
```python
# Check items_without_canonical - these need synonym mapping
```

### Find items in wrong windows:
```python
# Check row_details[].items_in_window vs items_assigned_to_row
# If item is in window but not assigned, check items_skipped
```

## Tips

1. **Always check debug file first** - it tells you exactly what went wrong
2. **Compare with source** - verify `_structured.json` has the data you expect
3. **Check synonyms** - most issues are missing synonym mappings
4. **Review line numbers** - window logic depends on accurate line numbers
5. **Use row_details** - per-row breakdown shows exactly what happened

