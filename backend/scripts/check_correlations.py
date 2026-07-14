import pandas as pd
import sys

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        sys.stdout.buffer.write((str(msg) + "\n").encode('utf-8'))

df = pd.read_csv('Hero_data (2).csv')
has_r1_like = df.iloc[:, 215].notna()
has_r2_like = df.iloc[:, 249].notna()
has_r3_like = df.iloc[:, 283].notna()

safe_print(f"Has R1 Like: {has_r1_like.sum()}") # 199
safe_print(f"Has R2 Like: {has_r2_like.sum()}") # 400
safe_print(f"Has R3 Like: {has_r3_like.sum()}") # 201

safe_print("\n--- GROUP 1: R1 Like Present (199 people) ---")
safe_print("FirstRotationBrand:")
safe_print(df[has_r1_like]['FirstRotationBrand'].value_counts())
safe_print("SecondRotationBrand:")
safe_print(df[has_r1_like]['SecondRotationBrand'].value_counts())

safe_print("\n--- GROUP 2: R1 Like NaN (201 people) ---")
safe_print("FirstRotationBrand:")
safe_print(df[~has_r1_like]['FirstRotationBrand'].value_counts())
safe_print("SecondRotationBrand:")
safe_print(df[~has_r1_like]['SecondRotationBrand'].value_counts())
safe_print("SecondRotationBrand (R3 column):")
safe_print(df[~has_r1_like]['SecondRotationBrandابو عوف (مربع)'].value_counts())
