
import httpx
import os
from backend.config import config

class WhisperClient:
    def __init__(self):
        self.base_url = config.LLMWHISPERER_BASE_URL_V2
        self.api_key = config.LLMWHISPERER_API_KEY
    
    def _get_headers(self):
        return {
            "unstract-key": self.api_key
        }

    async def upload_file(self, file_path: str, mode: str = "native_text"):
        """
        Uploads a file to LLMWhisperer V2 for extraction with specific parameters.
        """
        url = f"{self.base_url}/whisper"
        
        # Prepare query parameters
        params = {
            "mode": mode,
            "output_mode": "layout_preserving",
            "file_name": os.path.basename(file_path),
            "add_line_nos": "true"
        }
        
        headers = self._get_headers()
        # Note: 'Content-Type: application/octet-stream' is handled if we pass the content directly as body 
        # or if we use httpx's content parameter for raw bytes.
        # But requests usually take 'files' for multipart. 
        # User requirement says:
        # Headers: Content-Type: application/octet-stream
        # Body: raw file bytes
        # This implies we are NOT using multipart/form-data for the V2 API?
        # Actually, standard LLMWhisperer V2 often supports raw binary with query params.
        # Let's verify the user request: "Body: raw file bytes"
        
        # So we read the file and send it as 'content', not 'files'.
        
        headers["Content-Type"] = "application/octet-stream"

        async with httpx.AsyncClient() as client:
            with open(file_path, "rb") as f:
                file_content = f.read()
                
            response = await client.post(
                url, 
                headers=headers, 
                params=params,
                content=file_content,
                timeout=120.0
            )
            response.raise_for_status()
            # Expecting 202 Accepted
            return response.json()

    async def get_status(self, whisper_hash: str):
        """
        Check status of a job.
        Using V2 endpoint: /whisper-status?whisper_hash=<hash>
        """
        url = f"{self.base_url}/whisper-status"
        params = {"whisper_hash": whisper_hash}
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers(), params=params, timeout=30.0)
            response.raise_for_status()
            return response.json()

    async def get_result(self, whisper_hash: str):
        """
        Get extraction structure.
        Using V2 endpoint: /whisper-retrieve?whisper_hash=<hash>
        """
        url = f"{self.base_url}/whisper-retrieve"
        params = {"whisper_hash": whisper_hash}
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self._get_headers(), params=params, timeout=60.0)
            # 404 means not processed yet or invalid hash
            # 200 means success
            if response.status_code == 200:
                return response.json()
            else:
                response.raise_for_status()

whisper_client = WhisperClient()
