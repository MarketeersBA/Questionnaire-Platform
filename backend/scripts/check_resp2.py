import pandas as pd
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((str(msg) + "\n").encode('utf-8'))

df = pd.read_csv('Hero_data (2).csv')
resp2 = df.iloc[1] # Zero-indexed, so row 2 is index 1

safe_print(f"Respondent: {resp2['Name']}")
safe_print(f"FirstRotationBrand: {resp2['FirstRotationBrand']}")
safe_print(f"R1 Outershape: {resp2['إيه رأيك في شكل المنتج من بره؟']}")
safe_print(f"R1 Overall Likeness: {resp2['قيم إعجابك العام بالمنتج']}")

# Check all R1 attribute columns
attrs_r1 = [
    "إيه رأيك في شكل المنتج من بره؟", "إيه رأيك في اللون؟", "قيم ريحة المنتج بشكل عام",
    "هل ريحة المنتج باينة طبيعية؟", "إيه رأيك في لون المنتج من جوه؟", 
    "هل شكل المنتج من جوه باين إنه طبيعي؟", "إيه رأيك في ملمس وقوام المنتج؟",
    "قيم إعجابك العام بالمنتج"
]
for col in attrs_r1:
    safe_print(f"{col}: {resp2.get(col)}")
