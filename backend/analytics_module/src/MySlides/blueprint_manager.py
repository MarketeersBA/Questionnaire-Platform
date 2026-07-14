"""
Blueprint Manager (Phase 3): Save and load analytical configurations as reusable templates.
"""
import json
import logging
from typing import Dict, Any, List
import os

logger = logging.getLogger(__name__)

class BlueprintManager:
    """Repository for saving and loading successful report configurations."""
    def __init__(self, storage_path: str = "blueprints/"):
        self.storage_path = storage_path
        if not os.path.exists(storage_path):
            os.makedirs(storage_path)

    def save_blueprint(self, name: str, project_inputs: Dict[str, Any]):
        """Save currently used configurations as a named analytical preset."""
        # Strip out project-specific data (IDs, file paths)
        blueprint = {
            "name": name,
            "research_type": project_inputs.get("research_type"),
            "comparator_template": project_inputs.get("comparator_template"),
            "question_mapping": project_inputs.get("question_mapping"),
            "active_segments": project_inputs.get("active_segments"),
            "fidelity_settings": project_inputs.get("fidelity_settings")
        }
        
        file_path = os.path.join(self.storage_path, f"{name.lower().replace(' ', '_')}.json")
        with open(file_path, 'w') as f:
            json.dump(blueprint, f, indent=4)
        logger.info("Saved analytical blueprint: %s", name)

    def list_blueprints(self) -> List[str]:
        """Fetch all available preset blueprints."""
        return [f.replace('.json', '') for f in os.listdir(self.storage_path) if f.endswith('.json')]

    def load_blueprint(self, name: str) -> Dict[str, Any]:
        """Retrieve a stored blueprint for application to a new project."""
        file_path = os.path.join(self.storage_path, f"{name.lower().replace(' ', '_')}.json")
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
        return {}

    def create_draft_token(self, settings: Dict[str, Any]) -> str:
        """Create a temporary SID for sharing a configuration draft (Phase 5)."""
        import uuid
        token = str(uuid.uuid4())
        self.save_blueprint(f"draft_{token}", settings)
        return token

    def load_draft(self, token: str) -> Dict[str, Any]:
        """Load a shared draft for review and editing."""
        return self.load_blueprint(f"draft_{token}")
