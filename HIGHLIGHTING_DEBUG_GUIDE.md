# 🔍 Structured Data Highlighting - Debug Guide

## 📋 **Complete Flow (Step-by-Step)**

### **Step 1: AI Extraction (Backend)**
**Location:** `backend/services/llm_service.py`

1. **LLM receives raw text** with line numbers like `[12]`
2. **LLM extracts structured data** and creates `_source_refs`:
   ```json
   {
     "data.claims[0].claimant": [15, 16, 17],
     "data.claims[0].claimNumber": [12]
   }
   ```
3. **Line numbers in `_source_refs`** should match the line numbers in the raw text

**⚠️ POTENTIAL ISSUE #1:** AI might reference wrong line numbers
- Check: Are the line numbers in `_source_refs` correct?
- Debug: Look at `structuredData._source_refs` in browser console

---

### **Step 2: Path Matching (Frontend)**
**Location:** `src/components/StructuredDataViewer.tsx` → `getRefs()`

1. **User clicks** on a field (e.g., "SYDIA" in Claimant column)
2. **Component generates path:** `claims[0].claimant`
3. **`getRefs()` tries to match** this path in `_source_refs`
4. **Returns line IDs** if match found (e.g., `[15, 16, 17]`)

**⚠️ POTENTIAL ISSUE #2:** Path mismatch
- Check: Does the path format match what's in `_source_refs`?
- Debug: Check console for "Found sourceRefs" or "No match for path" messages

---

### **Step 3: Line Metadata Lookup (Frontend)**
**Location:** `src/pages/Workspace.tsx` → `highlightLineById()`

1. **Takes line ID** (e.g., `15`)
2. **Looks up metadata** from `lineMetadata[15]`
3. **Metadata format:** `[page, base_y, height, page_height]`
   - Example: `[0, 150, 12, 792]` = Page 0 (1-based: page 1), y=150, height=12, page_height=792

**⚠️ POTENTIAL ISSUE #3:** Wrong line metadata
- Check: Does `lineMetadata[15]` correspond to the correct line in the PDF?
- Debug: Compare line 15 in raw text with what's highlighted

---

### **Step 4: Backend Coordinate Calculation**
**Location:** `backend/routes/highlight.py` → `_get_line_coordinates()`

1. **Receives:** line index (15), target_width, target_height
2. **Gets metadata:** `[page, base_y, height, page_height]`
3. **Calculates coordinates:**
   - `top_y = base_y - height`
   - `y1 = (top_y / page_height) * target_height`
   - `y2 = ((top_y + height) / page_height) * target_height`
4. **Returns:** `{page, x1: 0, y1, x2: width, y2}`

**⚠️ POTENTIAL ISSUE #4:** Coordinate calculation error
- Check: Are the calculated y1, y2 correct?
- Debug: Check API response in Network tab

---

### **Step 5: Frontend Rendering**
**Location:** `src/components/workspace/HighlightOverlay.tsx`

1. **Receives bounding box:** `{x, y, width, height, page}`
2. **Renders highlight** at position `(x * scale, y * scale)`
3. **Scales by zoom/viewport scale**

**⚠️ POTENTIAL ISSUE #5:** Scale/position mismatch
- Check: Is the scale factor correct?
- Debug: Check if highlight position matches PDF text position

---

## 🐛 **Debugging Steps**

### **Step 1: Check AI Data Quality**
```javascript
// In browser console, after clicking "Analyze with AI":
console.log("Source Refs:", structuredData._source_refs);
console.log("Line Metadata:", lineMetadata);

// Check if line numbers make sense:
// Example: If you click "SYDIA", check what line IDs are in _source_refs
```

### **Step 2: Check Path Matching**
```javascript
// When clicking a field, check console for:
// "[StructuredDataViewer] Found sourceRefs for path..."
// OR
// "[StructuredDataViewer] No match for path..."
```

### **Step 3: Check Line Metadata**
```javascript
// After clicking, check:
// "[Workspace] Highlighting X line(s): [15, 16, 17]"
// Then check what lineMetadata[15] contains
```

### **Step 4: Check API Response**
```javascript
// In Network tab, find the /highlight request
// Check the response: {page, x1, y1, x2, y2}
// Verify these coordinates make sense
```

### **Step 5: Check Raw Text Alignment**
```javascript
// Compare:
// 1. What text is at line 15 in raw text?
// 2. What text is highlighted in PDF?
// 3. Do they match?
```

---

## 🔧 **Common Issues & Fixes**

### **Issue: Highlight appears in wrong place**
**Possible causes:**
1. ❌ AI referenced wrong line number
2. ❌ Line metadata is incorrect
3. ❌ Coordinate calculation is wrong
4. ❌ Scale/zoom mismatch

**Fix:**
- Check if line number in `_source_refs` matches the actual text location
- Verify `lineMetadata[lineId]` has correct page/y coordinates

### **Issue: Highlight doesn't appear**
**Possible causes:**
1. ❌ Path mismatch (can't find line IDs)
2. ❌ Line metadata missing
3. ❌ Page dimensions not loaded

**Fix:**
- Check console for "No match for path" messages
- Verify `lineMetadata` array has data for that line index

### **Issue: Highlight appears on wrong page**
**Possible causes:**
1. ❌ Page number in metadata is wrong
2. ❌ Page conversion (0-based vs 1-based) issue

**Fix:**
- Check `lineMetadata[lineId][0]` (page number)
- Verify page conversion: `pageZeroBased + 1` for PDF.js

---

## 📊 **Quick Diagnostic Checklist**

When highlighting is wrong, check:

- [ ] **AI Data:** Are line numbers in `_source_refs` correct?
- [ ] **Path Match:** Does the path match what's in `_source_refs`?
- [ ] **Line Metadata:** Does `lineMetadata[lineId]` exist and have correct data?
- [ ] **Coordinates:** Are the calculated y1, y2 values reasonable?
- [ ] **Page:** Is the highlight on the correct page?
- [ ] **Scale:** Does the highlight position match the text position visually?

