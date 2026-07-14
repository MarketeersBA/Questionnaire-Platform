"""Transposer Utility dialog: transpose scores by Attributes x Brands x Respondents."""

import tkinter as tk
from tkinter import ttk, scrolledtext


class TransposerDialog(tk.Toplevel):
    """Brand/Attribute Transposer - same behavior as frmAppendScores."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.title("Brand/Attribute Transposer")
        self.resizable(False, False)

        self._counter = 0
        self._count1 = 0

        self.txt_input = scrolledtext.ScrolledText(self, width=70, height=16, wrap=tk.NONE)
        self.txt_input.grid(row=0, column=0, columnspan=4, padx=8, pady=8, sticky="nsew")

        ttk.Label(self, text="Attributes").grid(row=1, column=0, padx=4, pady=4)
        self.text_attrs = ttk.Entry(self, width=8)
        self.text_attrs.grid(row=1, column=1, padx=4, pady=4)

        ttk.Label(self, text="Brands").grid(row=1, column=2, padx=4, pady=4)
        self.text_brands = ttk.Entry(self, width=8)
        self.text_brands.grid(row=1, column=3, padx=4, pady=4)

        ttk.Label(self, text="Num of respondents").grid(row=2, column=0, columnspan=2, padx=4, pady=4)
        self.text_respondents = ttk.Entry(self, width=8)
        self.text_respondents.grid(row=2, column=2, padx=4, pady=4)

        self.btn_calculate = ttk.Button(self, text="Transpose", command=self._on_transpose)
        self.btn_calculate.grid(row=2, column=3, padx=4, pady=4)

    def _on_transpose(self) -> None:
        sep = (",", "\r", "\t", "\n", "\x00")
        text = self.txt_input.get("1.0", tk.END)
        for s in sep:
            text = text.replace(s, "\t")
        parts = [p.strip() for p in text.split() if p.strip()]
        if not parts:
            return
        try:
            num_attrs = int(self.text_attrs.get().strip())
            num_brands = int(self.text_brands.get().strip())
            num_respondents = int(self.text_respondents.get().strip())
        except ValueError:
            return
        expected = num_respondents * num_attrs * num_brands
        if len(parts) < expected:
            return
        idx = 0
        arr2 = [[parts[idx + j] for j in range(num_attrs * num_brands)] for _ in range(num_respondents)]
        arr3 = [[""] * num_attrs for _ in range(num_brands * num_respondents)]
        for l in range(num_brands * num_respondents):
            for k in range(num_attrs):
                resp_idx = l % num_respondents
                brand_idx = l // num_respondents
                arr3[l][k] = arr2[resp_idx][k * num_brands + brand_idx]
        lines = []
        for m in range(num_brands * num_respondents):
            line = "\t".join(str(arr3[m][n]) for n in range(num_attrs))
            lines.append(line)
        self.txt_input.delete("1.0", tk.END)
        self.txt_input.insert("1.0", "\r\n".join(lines))
