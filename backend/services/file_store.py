
import os
import json
import aiofiles
from backend.config import config

import uuid

class FileStore:
    @staticmethod
    async def save_input_file(filename: str, content: bytes) -> str:
        """Saves an uploaded file to the input directory with a UUID prefix."""
        unique_id = str(uuid.uuid4())
        safe_filename = f"{unique_id}_{filename}"
        file_path = os.path.join(config.INPUT_DIR, safe_filename)
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)
        return file_path

    @staticmethod
    def save_json_output(whisper_hash: str, data: dict, suffix: str = "") -> str:
        """
        Saves a JSON object to the output directory.
        Suffix examples: '_status', '_result', etc.
        Final filename: output_files/<whisper_hash><suffix>.json
        """
        # Sanitize hash to remove invalid characters like pipe '|' sometimes sent by API
        safe_hash = whisper_hash.replace("|", "_")
        filename = f"{safe_hash}{suffix}.json"
        file_path = os.path.join(config.OUTPUT_DIR, filename)
        
        # Ensure directory exists just in case
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        return file_path

    @staticmethod
    def get_json_output(whisper_hash: str, suffix: str = "") -> dict:
        """Retrieves a JSON object from the output directory."""
        # Sanitize input hash to match saved files
        safe_hash = whisper_hash.replace("|", "_")
        filename = f"{safe_hash}{suffix}.json"
        file_path = os.path.join(config.OUTPUT_DIR, filename)
        
        if not os.path.exists(file_path):
            return None
            
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    @staticmethod
    def save_text_output(whisper_hash: str, text: str, suffix: str = "_raw_text") -> str:
        """
        Saves a text string to the output directory.
        Suffix examples: '_raw_text', etc.
        Final filename: output_files/<whisper_hash><suffix>.txt
        """
        # Sanitize hash to remove invalid characters like pipe '|' sometimes sent by API
        safe_hash = whisper_hash.replace("|", "_")
        filename = f"{safe_hash}{suffix}.txt"
        file_path = os.path.join(config.OUTPUT_DIR, filename)
        
        # Ensure directory exists just in case
        os.makedirs(config.OUTPUT_DIR, exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(text)
        return file_path

file_store = FileStore()
