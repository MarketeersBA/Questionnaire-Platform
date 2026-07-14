import sys
import os
import pandas as pd
import numpy as np

# Add backend to path
sys.path.append('d:/Questioner')

from backend.analytics_module.ingestor import SurveyData
from backend.analytics_module.aggregator import ReportAggregator

# Mock Data Generator
def create_mock_data():
    brands = ["Brand A", "Brand B", "Brand C"]
    attributes = ["Taste", "Price", "Quality"]
    
    rows = []
    # Create 100 responses
    for i in range(100):
        brand = np.random.choice(brands)
        # Mock Attribute scores (1-10)
        for attr in attributes:
            # Shift means slightly so we can see Sigma differences
            if brand == "Brand A" and attr == "Taste":
                val = np.random.randint(8, 11) # High
            elif brand == "Brand B" and attr == "Price":
                val = np.random.randint(1, 4)  # Low (Expensive)
            else:
                val = np.random.randint(4, 8)  # Average
                
            rows.append({
                "response_id": f"R_{i}",
                "brand": brand,
                "attribute": attr,
                "metric": attr,
                "value": val
            })
            
        # Mock Purchase Intent (T2B should be 4-5 on 5-scale, or 9-10 on 10-scale)
        pi_val = np.random.randint(1, 11)
        rows.append({
             "response_id": f"R_{i}",
             "brand": brand,
             "attribute": "Purchase Intent",
             "metric": "Purchase Intent",
             "value": pi_val
        })
        
        # Overall Likeness
        rows.append({
             "response_id": f"R_{i}",
             "brand": brand,
             "attribute": "General",
             "metric": "Overall Likeness",
             "value": np.random.randint(1, 11)
        })

    df = pd.DataFrame(rows)
    return df

def test_sigma_logic():
    df = create_mock_data()
    
    # Create Minimal SurveyData
    class MockSurveyData:
        def __init__(self, df):
            self.scale_evaluations = df
            self.evaluations = df
            self.brands = df["brand"].unique().tolist()
            self.response_count = len(df["response_id"].unique())
            self.open_ends = pd.DataFrame()
            self.purchase_funnel = pd.DataFrame()
            self.preferences = pd.DataFrame()
            self.demographics = pd.DataFrame()
            self.question_map = {}
            self.brand_master_list = self.brands
            self.purchase_funnel_brands = []

    data = MockSurveyData(df)
    agg = ReportAggregator(data, my_brand="Brand A")
    
    result = agg.enhanced_sigma_intent_analysis()
    
    print("\n--- Phase 1: Sigma Analytics Engine Verification ---")
    if not result:
        print("FAIL: No result returned")
        return

    print("SUCCESS: Chart ID:", result["chart_id"])
    print("Attributes found:", result["data"]["attributes"])
    
    # Check Taste dataset (Sample check)
    if "Taste" in result["data"]["datasets"]:
        taste_data = result["data"]["datasets"]["Taste"]
        print("\nSigma Scores for 'Taste':")
        for d in taste_data:
            print(f"  {d['brand']}: Sigma={d['x']}, Intent={d['y']}%, Mean={d['raw_mean']}, N={d['n']}")
    
    print("\nPipeline Registry check:")
    all_charts = agg.compute_all()
    if any(c["chart_id"] == "sigma_intent" for c in all_charts):
        print("SUCCESS: sigma_intent found in compute_all pipeline.")
    else:
        print("FAIL: sigma_intent missing from pipeline.")

if __name__ == "__main__":
    test_sigma_logic()
