
import os
import logging

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

logger = logging.getLogger(__name__)

def select_mode(file_path: str, user_override: str = None) -> str:
    """
    Selects the processing mode for LLMWhisperer based on file properties.
    
    Rules:
    1. User override takes precedence.
    2. 'form' in filename -> 'form'.
    3. PDF with text -> 'native_text', else 'high_quality'.
    4. Images/Office docs -> 'high_quality'.
    5. Spreadsheets -> 'table'.
    6. Default -> 'high_quality'.
    """
    if user_override:
        return user_override
        
    filename = os.path.basename(file_path).lower()
    ext = os.path.splitext(filename)[1]
    
    # Rule: If filename contains 'form' -> form
    # (Placed early as it's a strong semantic signal requested by user)
    if 'form' in filename:
        return "form"

    # Spreadsheets (including CSV)
    if ext in ['.xlsx', '.xls', '.ods', '.csv']:
        return "table"
        
    # Images and Office Docs
    # "If extension in [png, jpg, jpeg, tiff] -> high_quality"
    # "If extension in [docx, doc, pptx] -> high_quality"
    high_quality_exts = ['.png', '.jpg', '.jpeg', '.tiff', '.docx', '.doc', '.pptx']
    if ext in high_quality_exts:
        return "high_quality"

    # PDF Logic
    if ext == '.pdf':
        if not fitz:
            logger.warning("PyMuPDF (fitz) not installed. Defaulting PDF to native_text.")
            return "native_text" # Fallback if library missing
            
        try:
            with fitz.open(file_path) as doc:
                # Check first few pages for text
                has_text = False
                # Check up to first 3 pages to be safe and fast
                for pg_num in range(min(3, len(doc))):
                    page = doc.load_page(pg_num)
                    if page.get_text():
                        has_text = True
                        break
                
                return "native_text" if has_text else "high_quality"
        except Exception as e:
            logger.error(f"Error checking PDF text: {e}. Defaulting to high_quality.")
            return "high_quality"

    # Default
    return "high_quality"
