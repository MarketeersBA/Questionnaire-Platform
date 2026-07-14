
import pandas as pd
import json

def excel_to_json(file_path):
    # Load the Excel file
    xl = pd.ExcelFile(file_path)
    data = {}
    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name)
        # Convert to list of dictionaries, handling NaN values
        data[sheet_name] = df.where(pd.notnull(df), None).to_dict(orient='records')
    
    with open('excel_data.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    excel_to_json('Taste_Test_restructured.xlsx')
