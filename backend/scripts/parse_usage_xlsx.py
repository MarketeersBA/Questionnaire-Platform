import openpyxl
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wb = openpyxl.load_workbook(r'd:\Questioner\Usage Questionnaire for automation (1).xlsx', data_only=True)
for sheet_name in ['Usage', 'Purchase Behaveior']:
    ws = wb[sheet_name]
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append([c if c is not None else '' for c in row])
    out = f'd:\\Questioner\\tmp_{sheet_name.replace(" ", "_")}.json'
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f'Wrote {out}, {len(rows)} rows')
