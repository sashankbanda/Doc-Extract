import os
import json
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Resolve path relative to this file (backend/services/key_manager.py) -> backend/Api_keys
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY_FILE = os.path.join(BASE_DIR, "Api_keys")

class KeyManager:
    def __init__(self):
        self.key_file = KEY_FILE
        self._ensure_key_file()

    def _ensure_key_file(self):
        if not os.path.exists(self.key_file):
            with open(self.key_file, "w") as f:
                json.dump({}, f)

    def get_all_keys(self) -> Dict[str, str]:
        try:
            with open(self.key_file, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}
        except Exception as e:
            logger.error(f"Error reading key file: {e}")
            return {}

    def get_key(self, provider: str) -> Optional[str]:
        keys = self.get_all_keys()
        return keys.get(provider)

    def set_key(self, provider: str, key: str):
        keys = self.get_all_keys()
        keys[provider] = key
        try:
            with open(self.key_file, "w") as f:
                json.dump(keys, f, indent=2)
        except Exception as e:
            logger.error(f"Error writing key file: {e}")

    def delete_key(self, provider: str):
        keys = self.get_all_keys()
        if provider in keys:
            del keys[provider]
            try:
                with open(self.key_file, "w") as f:
                    json.dump(keys, f, indent=2)
            except Exception as e:
                logger.error(f"Error writing key file: {e}")

key_manager = KeyManager()
