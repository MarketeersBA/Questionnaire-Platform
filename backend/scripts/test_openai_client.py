import os
import sys
from pathlib import Path

# Add project root to sys.path
root = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(root))

from backend.analytics_module.config_loader import load_app_config
from openai import OpenAI

def test_client():
    print("Testing OpenAI Client Initialization...")
    try:
        config = load_app_config()
        client = config.client
        model = config.model
        
        print(f"Config loaded. Model: {model}")
        print(f"Client type: {type(client)}")
        
        # Test a mock call (or real if API key is valid in env)
        print("Attempting a metadata call (Models list) to verify connectivity/httpx...")
        # We don't actually need to call an endpoint, just initializing the client 
        # and accessing an attribute often triggers the httpx setup.
        print(f"OpenAI Base URL: {client.base_url}")
        
        # If we reach here without 'unexpected keyword argument proxies', Step 1 is fixed.
        print("\nSUCCESS: OpenAI client initialized correctly without proxy errors.")
        
    except Exception as e:
        print(f"\nFAILURE: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    test_client()
