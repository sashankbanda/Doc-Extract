
import logging
from typing import Dict, List, Optional, Any
import litellm
import asyncio

from backend.config import config
from backend.services.key_manager import key_manager

logger = logging.getLogger(__name__)

class JurorService:
    """
    Juror Service acts as a secondary validator for extracted content.
    It compares the extracted value against the raw source text (context)
    to identify issues like truncation, missing pre-headers, or hallucinations.
    """
    
    def __init__(self):
        # Default to a fast, smart model. Groq Llama 3 is perfect.
        self.default_model = "groq/llama-3.3-70b-versatile"
        
    def _get_api_key_for_model(self, model: str) -> Optional[str]:
        """Helper to resolve API key based on model prefix."""
        if model.startswith("groq/"):
            return key_manager.get_key("groq") or config.GROQ_API_KEY
        return config.GROQ_API_KEY # Default fallback

    async def verify_item_completeness(
        self, 
        key: str, 
        value: str, 
        context_text: str,
        model_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify if the extracted 'value' is semantically complete given the 'context_text'.
        Checks specifically for truncation or missing pre-headers.
        
        Args:
            key: Field name (e.g. "Claim Description")
            value: The extracted value to check
            context_text: The raw text surrounding the extraction (lines before/after)
            model_id: Model to use for the Juror (defaults to Groq)
            
        Returns:
            Dict with { "status": "verified" | "suspicious", "reason": str }
        """
        target_model = model_id if model_id else self.default_model
        api_key = self._get_api_key_for_model(target_model)
        
        system_prompt = (
            "You are a strict Data Integrity Juror. Your job is to verify if an extracted value "
            "completley captures the information from the source text, or if it was Truncated.\n\n"
            "**Truncation Rule:**\n"
            "Sometimes extraction models miss the first line of a multi-line field (e.g. they miss 'Hey gpt...' on the line above).\n"
            "If the extracted value is missing significant meaningful text that appears immediately before it in the context "
            "and clearly belongs to the same sentence/paragraph, mark it as SUSPICIOUS.\n\n"
            "**Output Format:**\n"
            "Return JSON: { \"status\": \"verified\" | \"suspicious\", \"reason\": \"explanation\" }"
        )
        
        user_prompt = (
            f"Field: {key}\n"
            f"Extracted Value: \"{value}\"\n\n"
            f"**Source Context (Raw Text):**\n"
            f"---------------------\n"
            f"{context_text}\n"
            f"---------------------\n\n"
            f"Task: Look at the text strictly. Is the Extracted Value missing any immediately preceding text "
            f"that completes the sentence or thought? If the value starts mid-sentence but the context shows the start, it is SUSPICIOUS."
        )

        kwargs = {
            "model": target_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1
        }
        
        if api_key:
            kwargs["api_key"] = api_key
            
        try:
            response = await litellm.acompletion(**kwargs)
            # parsing the response
            content = response.choices[0].message.content
            # extract json from code block if present
            if "```json" in content:
                match = re.search(r"```json\s*(\{.*?\})\s*```", content, re.DOTALL)
                if match:
                    content = match.group(1)
            elif "```" in content:
                 match = re.search(r"```\s*(\{.*?\})\s*```", content, re.DOTALL)
                 if match:
                     content = match.group(1)
            
            data = json.loads(content)
            
            verification_status = data.get("verification_status", "unverified")
            reason = data.get("reason", "No reason provided")
            
            return {
                "status": verification_status,
                "reason": reason
            }
        except Exception as e:
            logger.error(f"[JurorService] Verification failed: {e}")
            return {
                "status": "unverified",
                "reason": f"Juror error: {str(e)}"
            }

juror_service = JurorService()
