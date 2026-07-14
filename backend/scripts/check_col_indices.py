import pandas as pd
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((str(msg) + "\n").encode('utf-8'))

df = pd.read_csv('Hero_data (2).csv')
cols = df.columns.tolist()
for i, c in enumerate(cols):
    if 'FirstRotationBrand' in c or 'SecondRotationBrand' in c or 'إعجابك العام' in c:
        safe_print(f"{i}: {c}")
