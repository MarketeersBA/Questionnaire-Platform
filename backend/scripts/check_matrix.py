import pandas as pd
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((str(msg) + "\n").encode('utf-8'))

df = pd.read_csv('Hero_data (2).csv')
resp1 = df.iloc[0]
resp2 = df.iloc[1]

safe_print("--- Respondent 1 (Index 0) ---")
safe_print(f"B1 (184): {resp1.iloc[184]}")
safe_print(f"B1 Overall (215): {resp1.iloc[215]}")
safe_print(f"B2 (218): {resp1.iloc[218]}")
safe_print(f"B2 Overall (249): {resp1.iloc[249]}")
safe_print(f"B3 (252): {resp1.iloc[252]}")
safe_print(f"B3 Overall (283): {resp1.iloc[283]}")

safe_print("\n--- Respondent 2 (Index 1) ---")
safe_print(f"B1 (184): {resp2.iloc[184]}")
safe_print(f"B1 Overall (215): {resp2.iloc[215]}")
safe_print(f"B2 (218): {resp2.iloc[218]}")
safe_print(f"B2 Overall (249): {resp2.iloc[249]}")
safe_print(f"B3 (252): {resp2.iloc[252]}")
safe_print(f"B3 Overall (283): {resp2.iloc[283]}")
