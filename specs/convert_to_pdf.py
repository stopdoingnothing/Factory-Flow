"""Convert markdown spec files to formatted PDFs using fpdf2 + markdown."""

import re
import markdown
from fpdf import FPDF
from pathlib import Path

SPECS_DIR = Path(__file__).parent

MD_FILES = [
    "spec-aece-access-leave-and-hr-system.md",
    "spec-aece-payroll.md",
    "review-gap-analysis.md",
]

# Colour palette
BRAND_BLUE = (30, 90, 160)
LIGHT_GREY = (245, 246, 248)
MID_GREY = (180, 185, 195)
DARK = (30, 35, 45)
WHITE = (255, 255, 255)
CODE_BG = (240, 242, 246)


class SpecPDF(FPDF):
    def __init__(self, title: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.doc_title = title  # will be sanitized once font is available
        self.set_auto_page_break(auto=True, margin=22)
        self.set_margins(left=20, top=20, right=20)
        self.set_font("Helvetica", size=10)

    def header(self):
        if self.page_no() == 1:
            return
        # Thin top bar
        self.set_fill_color(*BRAND_BLUE)
        self.rect(0, 0, 210, 9, "F")
        self.set_y(11)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*MID_GREY)
        self.cell(0, 5, self._sanitize(self.doc_title), align="L")
        self.set_text_color(*DARK)
        self.ln(6)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(*MID_GREY)
        self.cell(0, 5, f"Page {self.page_no()}", align="C")
        self.set_text_color(*DARK)

    def cover_page(self, title: str, subtitle: str = ""):
        self.add_page()
        # Full-width top band
        self.set_fill_color(*BRAND_BLUE)
        self.rect(0, 0, 210, 80, "F")
        # Title text — vertically centred in the band
        self.set_y(28)
        self.set_font("Helvetica", "B", 24)
        self.set_text_color(*WHITE)
        self.multi_cell(0, 12, self._sanitize(title), align="C")
        if subtitle:
            self.ln(2)
            self.set_font("Helvetica", "I", 12)
            self.set_text_color(200, 220, 255)
            self.multi_cell(0, 8, self._sanitize(subtitle), align="C")
        # Date / company bar
        self.set_fill_color(*LIGHT_GREY)
        self.rect(0, 82, 210, 16, "F")
        self.set_y(88)
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*MID_GREY)
        self.cell(0, 6, "AEC Electronics (Pty) Ltd    |    April 2026", align="C")
        self.set_text_color(*DARK)

    def render_markdown(self, md_text: str):
        """Parse markdown and render section by section."""
        lines = md_text.splitlines()
        i = 0
        while i < len(lines):
            line = lines[i]

            # --- Headings ---
            if line.startswith("### "):
                self._h3(line[4:].strip())
            elif line.startswith("## "):
                self._h2(line[3:].strip())
            elif line.startswith("# "):
                self._h1(line[2:].strip())

            # --- Horizontal rule ---
            elif line.strip() in ("---", "***", "___"):
                self._hr()

            # --- Fenced code block ---
            elif line.strip().startswith("```"):
                code_lines = []
                i += 1
                while i < len(lines) and not lines[i].strip().startswith("```"):
                    code_lines.append(lines[i])
                    i += 1
                self._code_block("\n".join(code_lines))

            # --- Table ---
            elif "|" in line and i + 1 < len(lines) and re.match(r"^\|[-| :]+\|", lines[i + 1]):
                table_lines = [line]
                i += 1  # skip separator
                i += 1
                while i < len(lines) and "|" in lines[i]:
                    table_lines.append(lines[i])
                    i += 1
                self._table(table_lines)
                continue

            # --- Unordered list item ---
            elif re.match(r"^(\s*)[-*+] ", line):
                items = []
                indent_base = len(re.match(r"^(\s*)", line).group(1))
                while i < len(lines) and re.match(r"^(\s*)[-*+] ", lines[i]):
                    m = re.match(r"^(\s*)[-*+] (.*)", lines[i])
                    depth = (len(m.group(1)) - indent_base) // 2
                    items.append((depth, m.group(2).strip()))
                    i += 1
                self._bullet_list(items)
                continue

            # --- Numbered list item ---
            elif re.match(r"^\d+\. ", line):
                items = []
                n = 1
                while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                    text = re.sub(r"^\d+\. ", "", lines[i]).strip()
                    items.append((0, text, n))
                    n += 1
                    i += 1
                self._numbered_list(items)
                continue

            # --- Blank line ---
            elif line.strip() == "":
                self.ln(3)

            # --- Normal paragraph text ---
            else:
                # Collect continuation lines into a paragraph
                para = [line]
                i += 1
                while i < len(lines) and lines[i].strip() and not lines[i].startswith("#") and "|" not in lines[i] and not re.match(r"^(\s*)[-*+] |\d+\. ", lines[i]):
                    para.append(lines[i])
                    i += 1
                self._paragraph(" ".join(para))
                continue

            i += 1

    # ---- Rendering helpers ----

    def _h1(self, text):
        self.ln(6)
        self.set_fill_color(*BRAND_BLUE)
        self.rect(self.get_x(), self.get_y(), 170, 11, "F")
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(*WHITE)
        self.cell(0, 11, self._clean(text), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*DARK)
        self.ln(4)

    def _h2(self, text):
        self.ln(5)
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(*BRAND_BLUE)
        self.cell(0, 9, self._clean(text), new_x="LMARGIN", new_y="NEXT")
        # underline
        y = self.get_y()
        self.set_draw_color(*BRAND_BLUE)
        self.set_line_width(0.4)
        self.line(self.get_x(), y, self.get_x() + 170, y)
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.2)
        self.set_text_color(*DARK)
        self.ln(4)

    def _h3(self, text):
        self.ln(4)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*DARK)
        self.cell(0, 7, self._clean(text), new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(*DARK)
        self.ln(2)

    def _hr(self):
        self.ln(4)
        self.set_draw_color(*MID_GREY)
        self.set_line_width(0.3)
        self.line(20, self.get_y(), 190, self.get_y())
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.2)
        self.ln(4)

    def _paragraph(self, text):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        cleaned = self._inline(text)
        self.multi_cell(0, 6, cleaned, align="J")
        self.ln(2)

    def _bullet_list(self, items):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        left_margin = self.l_margin
        for depth, text in items:
            indent = 6 + depth * 7
            bullet = "-" if depth == 0 else ">"
            text_w = 170 - indent - 5
            # Page break safety: estimate height needed
            est_lines = max(1, int(self.get_string_width(self._inline(text)) / text_w) + 1)
            if self.get_y() + est_lines * 6 + 2 > self.page_break_trigger:
                self.add_page()
            self.set_x(left_margin + indent)
            self.cell(5, 6, bullet)
            self.multi_cell(text_w, 6, self._inline(text))
            self.set_x(left_margin)
        self.ln(2)

    def _numbered_list(self, items):
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        left_margin = self.l_margin
        for depth, text, n in items:
            indent = 6
            text_w = 170 - indent - 8
            est_lines = max(1, int(self.get_string_width(self._inline(text)) / text_w) + 1)
            if self.get_y() + est_lines * 6 + 2 > self.page_break_trigger:
                self.add_page()
            self.set_x(left_margin + indent)
            self.cell(8, 6, f"{n}.")
            self.multi_cell(text_w, 6, self._inline(text))
            self.set_x(left_margin)
        self.ln(2)

    def _code_block(self, code):
        self.ln(3)
        self.set_fill_color(*CODE_BG)
        self.set_font("Courier", "", 8)
        self.set_text_color(60, 60, 80)
        lines = code.splitlines() or [""]
        h = len(lines) * 5 + 6
        x, y = self.get_x(), self.get_y()
        self.rect(x, y, 170, h, "F")
        # Left accent bar
        self.set_fill_color(*BRAND_BLUE)
        self.rect(x, y, 2, h, "F")
        self.set_fill_color(*CODE_BG)
        self.set_xy(x + 5, y + 3)
        for ln in lines:
            self.cell(0, 5, ln[:105], new_x="LMARGIN", new_y="NEXT")
        self.set_font("Helvetica", "", 10)
        self.set_text_color(*DARK)
        self.ln(3)

    def _table(self, rows):
        """Render a markdown table with proper column widths and cell wrapping."""
        self.ln(4)
        TABLE_W = 170  # total usable width in mm
        ROW_H = 7      # base row height per line
        CELL_PAD = 3   # horizontal padding per cell

        headers = [self._clean(c.strip()) for c in rows[0].strip("|").split("|")]
        col_count = len(headers)

        # Build data rows (clean text)
        data_rows = []
        for row in rows[1:]:
            cells = [self._clean(c.strip()) for c in row.strip("|").split("|")]
            while len(cells) < col_count:
                cells.append("")
            data_rows.append(cells[:col_count])

        # --- Compute proportional column widths based on max content length ---
        col_max = [len(h) for h in headers]
        for row in data_rows:
            for ci, cell in enumerate(row):
                col_max[ci] = max(col_max[ci], len(cell))
        total_chars = sum(col_max) or 1
        col_widths = [max(15, TABLE_W * (m / total_chars)) for m in col_max]
        # Normalise so they sum to TABLE_W
        scale = TABLE_W / sum(col_widths)
        col_widths = [w * scale for w in col_widths]

        def row_height(cells, widths, font_size=8.5):
            """Calculate the max lines needed for a row."""
            max_lines = 1
            self.set_font("Helvetica", "", font_size)
            for text, w in zip(cells, widths):
                usable = w - CELL_PAD * 2
                if usable <= 0 or not text:
                    continue
                # Estimate characters per line using string width
                lines = max(1, int(self.get_string_width(text) / usable) + 1)
                max_lines = max(max_lines, lines)
            return max_lines * ROW_H + 2

        # --- Header row ---
        self.set_fill_color(*BRAND_BLUE)
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", 9)
        x_start = self.get_x()
        y_start = self.get_y()
        h_height = row_height(headers, col_widths, font_size=9)

        for ci, (header, w) in enumerate(zip(headers, col_widths)):
            # Draw filled rect for header cell
            self.set_xy(x_start + sum(col_widths[:ci]), y_start)
            self.set_fill_color(*BRAND_BLUE)
            self.rect(self.get_x(), self.get_y(), w, h_height, "F")
            self.set_xy(x_start + sum(col_widths[:ci]) + CELL_PAD, y_start + 1)
            self.multi_cell(w - CELL_PAD * 2, ROW_H, header, align="L")

        self.set_xy(x_start, y_start + h_height)
        self.set_text_color(*DARK)

        # --- Data rows ---
        self.set_font("Helvetica", "", 8.5)
        for ri, row in enumerate(data_rows):
            # Check page break
            r_height = row_height(row, col_widths)
            if self.get_y() + r_height > self.page_break_trigger:
                self.add_page()
                x_start = self.get_x()

            y_row = self.get_y()
            bg = LIGHT_GREY if ri % 2 == 0 else WHITE

            for ci, (cell, w) in enumerate(zip(row, col_widths)):
                cx = x_start + sum(col_widths[:ci])
                # Background fill
                self.set_fill_color(*bg)
                self.rect(cx, y_row, w, r_height, "F")
                # Thin right border (column separator)
                self.set_draw_color(*MID_GREY)
                self.set_line_width(0.15)
                self.line(cx + w, y_row, cx + w, y_row + r_height)
                # Cell text
                self.set_xy(cx + CELL_PAD, y_row + 1)
                self.multi_cell(w - CELL_PAD * 2, ROW_H, cell, align="L")

            # Bottom border for the row
            self.set_draw_color(*MID_GREY)
            self.set_line_width(0.15)
            self.line(x_start, y_row + r_height, x_start + TABLE_W, y_row + r_height)
            self.set_draw_color(0, 0, 0)
            self.set_line_width(0.2)
            self.set_xy(x_start, y_row + r_height)

        # Outer border
        self.set_draw_color(*BRAND_BLUE)
        self.set_line_width(0.3)
        table_top = y_start
        table_bottom = self.get_y()
        self.rect(x_start, table_top, TABLE_W, table_bottom - table_top, "D")
        self.set_draw_color(0, 0, 0)
        self.set_line_width(0.2)
        self.ln(5)

    @staticmethod
    def _sanitize(text: str) -> str:
        """Replace non-latin-1 characters with ASCII equivalents."""
        replacements = {
            "\u2014": " - ",  # em dash -> spaced hyphen
            "\u2013": "-",    # en dash
            "\u2022": "-",    # bullet
            "\u2019": "'",    # right single quote
            "\u2018": "'",    # left single quote
            "\u201c": '"',    # left double quote
            "\u201d": '"',    # right double quote
            "\u2026": "...",  # ellipsis
            "\u2192": "->",   # right arrow
            "\u2190": "<-",   # left arrow
            "\u2665": "*",    # heart
            "\u00e2": "a",    # a with circumflex
            "\u00e9": "e",    # e with accent
            "\u00b7": ".",    # middle dot
        }
        for ch, sub in replacements.items():
            text = text.replace(ch, sub)
        # Drop any remaining non-latin-1 characters
        return text.encode("latin-1", errors="replace").decode("latin-1")

    @staticmethod
    def _clean(text: str) -> str:
        """Strip markdown formatting for plain rendering."""
        text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
        text = re.sub(r"\*(.*?)\*", r"\1", text)
        text = re.sub(r"`(.*?)`", r"\1", text)
        text = re.sub(r"\[(.*?)\]\(.*?\)", r"\1", text)
        return SpecPDF._sanitize(text.strip())

    @staticmethod
    def _inline(text: str) -> str:
        """Strip inline markdown."""
        return SpecPDF._clean(text)


def md_title(path: Path) -> str:
    """Extract first H1 from markdown as document title."""
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem.replace("-", " ").title()


def convert(md_path: Path):
    text = md_path.read_text(encoding="utf-8")
    title = md_title(md_path)
    pdf = SpecPDF(title=title)
    pdf.cover_page(title)
    pdf.add_page()
    pdf.render_markdown(text)

    out = md_path.with_suffix(".pdf")
    pdf.output(str(out))
    print(f"  Created: {out.name}")


if __name__ == "__main__":
    print("Converting spec files to PDF...")
    for name in MD_FILES:
        path = SPECS_DIR / name
        if path.exists():
            convert(path)
        else:
            print(f"  Skipped (not found): {name}")
    print("Done.")
