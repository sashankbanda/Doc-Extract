# Deprecated Services

The following services are deprecated and no longer used:

1. **normalization_service.py** - Field normalization is no longer needed. The backend returns raw keys with semantic_type tags.

2. **grouping_service.py** - Claim-window-based grouping has been removed. All items are preserved in a flat structure.

3. **metadata_service.py** - Metadata standardization is no longer needed in the new architecture.

4. **structured_organizer.py** - Organization logic has been moved to the frontend. The backend now returns flat items with semantic_type tags.

These services can be safely removed in a future cleanup, but are kept for reference during the transition period.

