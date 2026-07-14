import time
import datetime
from typing import Dict, List, Any

class TelemetryCollector:
    """
    Collects execution metrics for various pipeline stages.
    Provides data for performance auditing and bottlenecks identification.
    """
    def __init__(self):
        self.events = {}
        self.history = []
        self.start_time = time.time()

    def start_event(self, name: str):
        self.events[name] = {
            "name": name,
            "start": time.time(),
            "start_iso": datetime.datetime.now().isoformat()
        }

    def end_event(self, name: str):
        if name not in self.events:
            return
        
        event = self.events[name]
        event["end"] = time.time()
        event["end_iso"] = datetime.datetime.now().isoformat()
        event["duration_sec"] = round(event["end"] - event["start"], 4)
        self.history.append(event)
        del self.events[name]

    def get_summary(self) -> List[Dict[str, Any]]:
        total_duration = round(time.time() - self.start_time, 4)
        return {
            "total_duration_sec": total_duration,
            "events": self.history
        }

    def save(self, output_dir: str):
        import os
        import json
        summary = self.get_summary()
        path = os.path.join(output_dir, "execution_telemetry.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2)
        return path

# Global or instance-based? Instance-based is better for SurveyAnalyzer.
