import logging
from typing import Dict, List, Type, Optional
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept

logger = logging.getLogger(__name__)

# Global registry: section_name -> List of Concept Classes
_CONCEPT_REGISTRY: Dict[str, List[Type[DynamicSlideConcept]]] = {}

def register_slide(section: str):
    """
    Decorator to register a DynamicSlideConcept class to a specific section.
    Usage:
        @register_slide(section="Brand Awareness")
        class MySlide(DynamicSlideConcept):
            ...
    """
    def decorator(cls: Type[DynamicSlideConcept]):
        sec = section.strip().lower()
        if sec not in _CONCEPT_REGISTRY:
            _CONCEPT_REGISTRY[sec] = []
        
        if cls not in _CONCEPT_REGISTRY[sec]:
            _CONCEPT_REGISTRY[sec].append(cls)
            logger.debug(f"Registered slide concept {cls.__name__} to section '{sec}'")
        return cls
    return decorator

def get_registry() -> Dict[str, List[Type[DynamicSlideConcept]]]:
    """Returns the current global registry."""
    return _CONCEPT_REGISTRY

def discover_slides():
    """
    Automatically discovers and imports all modules in the MySlides package
    to trigger the @register_slide decorators.
    """
    import pkgutil
    import importlib
    import backend.analytics_module.src.MySlides as MySlides
    
    for loader, module_name, is_pkg in pkgutil.walk_packages(MySlides.__path__, MySlides.__name__ + "."):
        # Avoid re-importing the runner or base to prevent circularity
        if "run" in module_name or "base" in module_name or "registry" in module_name:
            continue
        try:
            importlib.import_module(module_name)
        except Exception as e:
            logger.error(f"Failed to import module {module_name} during slide discovery: {e}")
