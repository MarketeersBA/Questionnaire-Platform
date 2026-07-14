import pandas as pd
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((str(msg) + "\n").encode('utf-8'))

df = pd.read_csv('Hero_data (2).csv')
likeness_cols = [c for c in df.columns if 'إعجابك العام' in c]
for c in likeness_cols:
    safe_print(f"Col: '{c}' - Count: {df[c].count()}")
