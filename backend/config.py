import os
from dotenv import load_dotenv

# Load .env from the same directory as this config file
basedir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(basedir, ".env"))

class Config:
    LLMWHISPERER_API_KEY = os.getenv("LLMWHISPERER_API_KEY")
    if not LLMWHISPERER_API_KEY:
        raise ValueError("LLMWHISPERER_API_KEY environment variable is not set.")
    
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable is not set.")
    
    LLMWHISPERER_BASE_URL_V2 = os.getenv("LLMWHISPERER_BASE_URL_V2", "https://llmwhisperer-api.us-central.unstract.com/api/v2")
    # Default CORS origins - include common dev ports
    default_cors = "http://localhost:3000,http://localhost:5173,http://localhost:8080"
    cors_env = os.getenv("CORS_ORIGINS", default_cors)
    # Always ensure localhost:8080 is included
    cors_list = [origin.strip() for origin in cors_env.split(",")]
    if "http://localhost:8080" not in cors_list:
        cors_list.append("http://localhost:8080")
    CORS_ORIGINS = cors_list
    print(f"[Config] CORS_ORIGINS loaded: {CORS_ORIGINS} (from env: {cors_env})")
    BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8005")
    
    # Input/Output directories
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    INPUT_DIR = os.path.join(BASE_DIR, "input_files")
    OUTPUT_DIR = os.path.join(BASE_DIR, "output_files")
    
    # Extraction strictness mode (off by default)
    # When enabled: drops low-confidence fields, ambiguous collisions, fields outside windows
    STRICT_EXTRACTION = os.getenv("STRICT_EXTRACTION", "false").lower() == "true"

config = Config()
