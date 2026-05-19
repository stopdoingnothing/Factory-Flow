"""Generate a professional PDF from the SDN Work Report markdown."""

import re
from fpdf import FPDF

INPUT = "SDN_WORK_REPORT.md"
OUTPUT = "SDN_WORK_REPORT.pdf"

# ── Colour palette ──────────────────────────────────────────────
DARK_RED = (139, 26, 26)
BLACK = (30, 30, 30)
GREY = (80, 80, 80)
LIGHT_GREY = (200, 200, 200)
WHITE = (255, 255, 255)
TABLE_HEADER_BG = (50, 50, 50)
TABLE_ALT_BG = (245, 245, 245)


class ReportPDF(FPDF):
    def setup_fonts(self):
        """Register DejaVu TTF fonts for full Unicode support."""
        import os
        # Use Windows system fonts
        win_fonts = "C:/Windows/Fonts"
        # Use Arial (supports extended latin) and Consolas for mono
        self.add_font("body", "", os.path.join(win_fonts, "arial.ttf"), uni=True)
        self.add_font("body", "B", os.path.join(win_fonts, "arialbd.ttf"), uni=True)
        self.add_font("body", "I", os.path.join(win_fonts, "ariali.ttf"), uni=True)
        self.add_font("body", "BI", os.path.join(win_fonts, "arialbi.ttf"), uni=True)
        self.add_font("mono", "", os.path.join(win_fonts, "consola.ttf"), uni=True)
        self.add_font("mono", "B", os.path.join(win_fonts, "consolab.ttf"), uni=True)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("body", "I", 8)
        self.set_text_color(*GREY)
        self.cell(0, 8, "SDN Branch Work Report  |  Shaun Bennet  |  April 2026", align="R")
        self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font("body", "I", 8)
        self.set_text_color(*GREY)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")


def parse_table(lines, start_idx):
    """Parse a markdown table starting at start_idx. Returns (rows, end_idx)."""
    rows = []
    i = start_idx
    while i < len(lines) and "|" in lines[i]:
        cells = [c.strip() for c in lines[i].split("|")]
        cells = [c for c in cells if c != ""]
        # skip separator row
        if cells and all(re.match(r"^[-:]+$", c) for c in cells):
            i += 1
            continue
        if cells:
            rows.append(cells)
        i += 1
    return rows, i


def render_inline(pdf, text, default_style=""):
    """Render text with inline **bold** and `code` formatting."""
    size = pdf.font_size_pt
    parts = re.split(r"(\*\*.*?\*\*|`[^`]+`)", text)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            pdf.set_font("body", "B", size)
            pdf.write(5, part[2:-2])
            pdf.set_font("body", default_style, size)
        elif part.startswith("`") and part.endswith("`"):
            pdf.set_font("mono", "", max(size - 1, 7))
            pdf.set_text_color(139, 26, 26)
            pdf.write(5, part[1:-1])
            pdf.set_text_color(*BLACK)
            pdf.set_font("body", default_style, size)
        else:
            pdf.write(5, part)


def add_title_page(pdf, lines):
    """Render a professional title page."""
    pdf.add_page()

    # Top bar
    pdf.set_fill_color(*DARK_RED)
    pdf.rect(0, 0, 210, 6, "F")

    # Title
    pdf.set_y(60)
    pdf.set_font("body", "B", 32)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 16, "SDN Branch", align="C")
    pdf.ln(16)
    pdf.cell(0, 16, "Work Report", align="C")
    pdf.ln(24)

    # Divider
    pdf.set_draw_color(*DARK_RED)
    pdf.set_line_width(0.8)
    pdf.line(60, pdf.get_y(), 150, pdf.get_y())
    pdf.ln(12)

    # Subtitle
    pdf.set_font("body", "", 14)
    pdf.set_text_color(*GREY)
    pdf.cell(0, 8, "Factory Flow (AECE Checkpoint)", align="C")
    pdf.ln(24)

    # Metadata
    meta = [
        ("Author", "Shaun Bennet (stopdoingnothing)"),
        ("Period", "April 1-8, 2026"),
        ("Commits", "67"),
        ("Scope", "Infrastructure, hardening, compliance, RBAC,"),
    ]
    meta2 = ("", "leave engine, theme system, deployment tooling")

    pdf.set_font("body", "", 11)
    for label, value in meta:
        pdf.set_x(50)
        pdf.set_text_color(*GREY)
        pdf.set_font("body", "B", 11)
        if label:
            pdf.cell(30, 7, f"{label}:", align="R")
        else:
            pdf.cell(30, 7, "", align="R")
        pdf.set_font("body", "", 11)
        pdf.set_text_color(*BLACK)
        pdf.cell(0, 7, f"  {value}")
        pdf.ln(7)

    # Scope continuation
    pdf.set_x(50)
    pdf.set_text_color(*GREY)
    pdf.set_font("body", "B", 11)
    pdf.cell(30, 7, "", align="R")
    pdf.set_font("body", "", 11)
    pdf.set_text_color(*BLACK)
    pdf.cell(0, 7, f"  {meta2[1]}")
    pdf.ln(20)

    # Bottom bar
    pdf.set_fill_color(*DARK_RED)
    pdf.rect(0, 285, 210, 6, "F")


def main():
    with open(INPUT, "r", encoding="utf-8") as f:
        raw = f.read()

    lines = raw.split("\n")
    pdf = ReportPDF("P", "mm", "A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Setup Unicode fonts
    pdf.setup_fonts()

    # Title page
    add_title_page(pdf, lines)

    # Start content
    pdf.add_page()

    i = 0
    # Skip the front-matter (title + metadata lines) already on title page
    while i < len(lines):
        if lines[i].startswith("## "):
            break
        i += 1

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip horizontal rules
        if stripped == "---":
            pdf.ln(4)
            pdf.set_draw_color(*LIGHT_GREY)
            pdf.set_line_width(0.3)
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(4)
            i += 1
            continue

        # H2 heading
        if stripped.startswith("## "):
            heading = stripped[3:].strip()
            # Check if we need a new page (less than 40mm remaining)
            if pdf.get_y() > 250:
                pdf.add_page()
            pdf.ln(6)
            pdf.set_font("body", "B", 16)
            pdf.set_text_color(*DARK_RED)
            pdf.cell(0, 10, heading)
            pdf.ln(10)
            pdf.set_draw_color(*DARK_RED)
            pdf.set_line_width(0.5)
            pdf.line(10, pdf.get_y(), 200, pdf.get_y())
            pdf.ln(4)
            pdf.set_text_color(*BLACK)
            i += 1
            continue

        # H3 heading
        if stripped.startswith("### "):
            heading = stripped[4:].strip()
            if pdf.get_y() > 260:
                pdf.add_page()
            pdf.ln(4)
            pdf.set_font("body", "B", 13)
            pdf.set_text_color(*BLACK)
            pdf.cell(0, 8, heading)
            pdf.ln(8)
            i += 1
            continue

        # H4 heading
        if stripped.startswith("#### "):
            heading = stripped[5:].strip()
            if pdf.get_y() > 265:
                pdf.add_page()
            pdf.ln(2)
            pdf.set_font("body", "B", 11)
            pdf.set_text_color(*GREY)
            pdf.cell(0, 7, heading)
            pdf.ln(7)
            pdf.set_text_color(*BLACK)
            i += 1
            continue

        # Table
        if "|" in stripped and stripped.startswith("|"):
            rows, end_idx = parse_table(lines, i)
            if rows:
                render_table(pdf, rows)
            i = end_idx
            continue

        # Bullet points (- or numbered)
        if re.match(r"^(\d+\.\s+|- )", stripped):
            match = re.match(r"^(\d+\.\s+|- )(.*)", stripped)
            if match:
                marker = match.group(1).strip()
                content = match.group(2)

                if pdf.get_y() > 272:
                    pdf.add_page()

                pdf.set_font("body", "", 10)
                pdf.set_text_color(*BLACK)

                # Marker
                pdf.set_x(14)
                if marker == "-":
                    pdf.set_font("body", "B", 10)
                    pdf.set_text_color(*DARK_RED)
                    pdf.write(5, "  \u2022  ")
                    pdf.set_text_color(*BLACK)
                    pdf.set_font("body", "", 10)
                else:
                    pdf.set_text_color(*DARK_RED)
                    pdf.set_font("body", "B", 10)
                    pdf.write(5, f" {marker} ")
                    pdf.set_text_color(*BLACK)
                    pdf.set_font("body", "", 10)

                render_inline(pdf, content)
                pdf.ln(6)
            i += 1
            continue

        # Code block
        if stripped.startswith("```"):
            i += 1
            code_lines = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing ```

            pdf.set_fill_color(245, 245, 245)
            pdf.set_font("mono", "", 8)
            pdf.set_text_color(60, 60, 60)
            for cl in code_lines:
                if pdf.get_y() > 275:
                    pdf.add_page()
                pdf.set_x(14)
                pdf.cell(182, 4.5, cl, fill=True)
                pdf.ln(4.5)
            pdf.set_text_color(*BLACK)
            pdf.ln(3)
            continue

        # Regular paragraph
        if stripped:
            if pdf.get_y() > 272:
                pdf.add_page()
            pdf.set_font("body", "", 10)
            pdf.set_text_color(*BLACK)
            pdf.set_x(10)
            render_inline(pdf, stripped)
            pdf.ln(6)

        i += 1

    pdf.output(OUTPUT)
    print(f"PDF generated: {OUTPUT}")


def render_table(pdf, rows):
    """Render a markdown table as a styled PDF table."""
    if not rows:
        return

    if pdf.get_y() > 240:
        pdf.add_page()

    pdf.ln(2)
    num_cols = len(rows[0])
    page_width = 190
    col_widths = [page_width / num_cols] * num_cols

    # Try to auto-size columns based on content
    if num_cols > 0:
        max_lens = [0] * num_cols
        for row in rows:
            for j, cell in enumerate(row):
                if j < num_cols:
                    max_lens[j] = max(max_lens[j], len(cell))
        total = sum(max_lens) or 1
        col_widths = [(l / total) * page_width for l in max_lens]

    for row_idx, row in enumerate(rows):
        if pdf.get_y() > 275:
            pdf.add_page()

        row_height = 7

        if row_idx == 0:
            # Header row
            pdf.set_fill_color(*TABLE_HEADER_BG)
            pdf.set_text_color(*WHITE)
            pdf.set_font("body", "B", 9)
        else:
            if row_idx % 2 == 0:
                pdf.set_fill_color(*TABLE_ALT_BG)
            else:
                pdf.set_fill_color(*WHITE)
            pdf.set_text_color(*BLACK)
            pdf.set_font("body", "", 9)

        x_start = 10
        pdf.set_x(x_start)
        for j, cell in enumerate(row):
            w = col_widths[j] if j < len(col_widths) else col_widths[-1]
            # Truncate if too long for cell
            display = cell
            pdf.cell(w, row_height, f" {display}", border=0, fill=True)

        pdf.ln(row_height)

    # Bottom border
    pdf.set_draw_color(*LIGHT_GREY)
    pdf.set_line_width(0.3)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    pdf.set_text_color(*BLACK)


if __name__ == "__main__":
    main()
