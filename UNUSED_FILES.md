# Unused Code Files

This document lists all code files that are currently not used in the project. These files can be safely removed during cleanup, but are kept for reference.

## Frontend Files (src/)

### Components

1. **`src/components/DocumentWorkspace.tsx`**
   - Status: Not imported anywhere
   - Note: Appears to be an old/alternative workspace component

2. **`src/components/UploadAndProcess.tsx`**
   - Status: Not imported anywhere
   - Note: Old upload component (replaced by `src/pages/Upload.tsx`)

3. **`src/components/TextPanel.tsx`**
   - Status: Only used by `DocumentWorkspace.tsx` (which is unused)
   - Note: Can be removed if `DocumentWorkspace` is removed

4. **`src/components/workspace/StructuredTablePanel.tsx`**
   - Status: Imported in `Workspace.tsx` but never rendered
   - Note: The "tables" tab uses `StructuredDataViewer` instead. `mockTables` is an empty array and never populated.

5. **`src/components/workspace/TemplateFieldsPanel.tsx`**
   - Status: Not imported anywhere
   - Note: Unused component

6. **`src/components/NavLink.tsx`**
   - Status: Not imported anywhere
   - Note: Unused wrapper component

### Utilities

7. **`src/utils/api.ts`**
   - Status: Not imported anywhere
   - Note: API functions are in `src/lib/api.ts` instead

### UI Components (shadcn/ui)

8. **`src/components/ui/sidebar.tsx`**
   - Status: Only used internally (self-referential), not imported/used in the app
   - Note: Part of shadcn/ui component library but currently unused. May be kept for future use.

## Backend Files (backend/)

### Routes

1. **`backend/routes/webhook.py`**
   - Status: Deprecated endpoint that returns 410 error
   - Note: Not included in `main.py` router registration

### Services (Deprecated)

2. **`backend/services/grouping_service.py`**
   - Status: Deprecated (per `README_DEPRECATED.md`)
   - Note: Not imported anywhere. Claim-window-based grouping has been removed.

3. **`backend/services/normalization_service.py`**
   - Status: Deprecated (per `README_DEPRECATED.md`)
   - Note: Not imported anywhere. Field normalization is no longer needed.

4. **`backend/services/metadata_service.py`**
   - Status: Deprecated (per `README_DEPRECATED.md`)
   - Note: Only imported by deprecated `grouping_service.py`. Metadata standardization is no longer needed.

5. **`backend/services/structured_organizer.py`**
   - Status: Deprecated (per `README_DEPRECATED.md`)
   - Note: Not imported anywhere. Organization logic has been moved to the frontend.

## Summary

- **Frontend**: 8 unused files
- **Backend**: 5 unused files (4 deprecated services + 1 deprecated route)
- **Total**: 13 unused code files

## Notes

- The deprecated backend services are kept for reference during the transition period but can be safely removed in a future cleanup.
- The `sidebar.tsx` component is part of the shadcn/ui library and may be kept for future use, but it's currently unused.
- Before removing any files, ensure they are not referenced in:
  - Configuration files
  - Build scripts
  - Documentation
  - Test files

