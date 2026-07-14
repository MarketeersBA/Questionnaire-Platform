import pandas as pd
import json

def extract_excel():
    path = r'd:\Questioner\brand_analyzer_questionnaire (1).xlsx'
    xl = pd.ExcelFile(path)
    # Just take the first sheet
    df = pd.read_excel(path, sheet_name=xl.sheet_names[0])
    
    # Save as JSON to be safe with encoding
    data = df.to_dict(orient='records')
    with open(r'd:\Questioner\ba_excel_structure.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    extract_excel()
