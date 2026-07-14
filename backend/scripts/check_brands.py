import pandas as pd
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((str(msg) + "\n").encode('utf-8'))

df = pd.read_csv('Hero_data (2).csv')
cols = ['FirstRotationBrand', 'SecondRotationBrand', 'SecondRotationBrandابو عوف (مربع)']
for col in cols:
    safe_print(f"\nValues in {col}:")
    safe_print(df[col].value_counts(dropna=False))
