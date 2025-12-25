
import os
import json
import glob
from typing import List, Dict, Any
from backend.config import config

REGISTRY_FILE = "dashboard_registry.json"

class DashboardService:
    def __init__(self):
        self.registry_path = os.path.join(config.OUTPUT_DIR, REGISTRY_FILE)
        self._ensure_registry()

    def _ensure_registry(self):
        """Ensure the registry file exists."""
        if not os.path.exists(config.OUTPUT_DIR):
            os.makedirs(config.OUTPUT_DIR, exist_ok=True)
        
        if not os.path.exists(self.registry_path):
            with open(self.registry_path, 'w', encoding='utf-8') as f:
                json.dump({}, f)

    def _load_registry(self) -> Dict[str, Any]:
        """Load the current registry."""
        try:
            with open(self.registry_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _save_registry(self, registry: Dict[str, Any]):
        """Save the registry."""
        with open(self.registry_path, 'w', encoding='utf-8') as f:
            json.dump(registry, f, indent=2)

    def register_file(self, whisper_hash: str, filename: str, status: str = "Pending"):
        """Register a new file in the dashboard."""
        registry = self._load_registry()
        
        registry[whisper_hash] = {
            "status": status,
            "filename": filename,
            "last_updated": str(os.path.getmtime(self.registry_path) if os.path.exists(self.registry_path) else 0)
        }
        
        self._save_registry(registry)

    def update_status(self, whisper_hash: str, status: str):
        """Update the review status of a file."""
        registry = self._load_registry()
        
        if whisper_hash not in registry:
            registry[whisper_hash] = {}
        
        registry[whisper_hash]['status'] = status
        registry[whisper_hash]['last_updated'] = str(os.path.getmtime(self.registry_path) if os.path.exists(self.registry_path) else 0)
        
        self._save_registry(registry)

    def get_dashboard_data(self) -> Dict[str, Any]:
        """
        Get all files with their status and stats.
        """
        registry = self._load_registry()
        files_data = []
        stats = {
            "total": 0,
            "completed": 0,
            "in_progress": 0,
            "pending": 0
        }
        
        # 1. Add all files from Registry (Primary Source)
        for whisper_hash, meta in registry.items():
            status = meta.get('status', 'Pending')
            filename = meta.get('filename', whisper_hash)
            
            # Update Stats
            lower_status = status.lower().replace(" ", "_")
            if lower_status == 'completed':
                stats['completed'] += 1
            elif lower_status == 'in_progress':
                stats['in_progress'] += 1
            else:
                stats['pending'] += 1
            stats['total'] += 1
            
            files_data.append({
                "id": whisper_hash,
                "filename": filename,
                "status": status,
                "hash": whisper_hash
            })
            
        # 2. Check for output files NOT in registry (Backward Compatibility)
        # REMOVED: This was causing ghost files (e.g. results showing up as new docs).
        # We rely on the Registry as the source of truth for Dashboard files.
        # If we need to recover files, we should have a specific 'Recovery' tool/script.
        
        # Sort by status (Pending first) or date can be handled by frontend or here.

        # Sort by status (Pending first) or date?
        # Let's simple append for now.

        return {
            "stats": stats,
            "files": files_data
        }

dashboard_service = DashboardService()
