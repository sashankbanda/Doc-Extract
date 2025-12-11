import os
from dotenv import load_dotenv

# Load .env from the same directory as this config file
basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(basedir, ".env"))

class Config:
    LLMWHISPERER_API_KEY = os.getenv("LLMWHISPERER_API_KEY")
    if not LLMWHISPERER_API_KEY:
        raise ValueError("LLMWHISPERER_API_KEY environment variable is not set.")
    
    LLMWHISPERER_BASE_URL_V2 = os.getenv("LLMWHISPERER_BASE_URL_V2", "https://llmwhisperer-api.us-central.unstract.com/api/v2")
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8005")
    
    # Input/Output directories
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    INPUT_DIR = os.path.join(BASE_DIR, "input_files")
    OUTPUT_DIR = os.path.join(BASE_DIR, "output_files")

config = Config()
