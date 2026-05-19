#!/usr/bin/env python3
"""Convert markdown to PDF using fpdf2 with proper formatting"""

import os
import re
from fpdf import FPDF
from datetime import datetime

# Get the docs/training directory
script_dir = os.path.dirname(os.path.abspath(__file__))
docs_dir = os.path.join(script_dir, '..', 'docs', 'training')

# Files to convert
files = [
    'hr-user-guide.md',
    'admin-reference-manual.md',
    'hr-quick-reference.md',
    'README.md'
]


class MarkdownPDF(FPDF):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.heading_y = 0
        self.section_num = 0
        self.subsection_num = 0
        self.toc_entries = []
        self.page_breaks = []

    def header(self):
        # Header with line
        self.set_font('Arial', 'I', 8)
        self.set_text_color(100)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 1, 'R')

    def footer(self):
        # Footer
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.set_text_color(128)
        self.cell(0, 10, f'Generated: {datetime.now().strftime("%Y-%m-%d")}', 0, 0, 'C')

    def add_toc_entry(self, text, level, page_num):
        """Track TOC entries"""
        self.toc_entries.append({
            'text': text,
            'level': level,
            'page': page_num
        })

    def parse_markdown(self, text):
        """Parse markdown and return structured content"""
        lines = text.split('\n')
        content = []
        current_block = []
        in_table = False
        table_lines = []

        for i, line in enumerate(lines):
            # Check for tables
            if '|' in line and i > 0 and '|' in lines[i-1]:
                if not in_table:
                    if current_block:
                        content.append(('text', '\n'.join(current_block)))
                        current_block = []
                    in_table = True
                table_lines.append(line)
            elif in_table and '|' in line:
                table_lines.append(line)
            elif in_table and '|' not in line:
                # End of table
                if table_lines:
                    content.append(('table', table_lines))
                    table_lines = []
                in_table = False
                if line.strip():
                    current_block.append(line)
            elif line.startswith('# '):
                if current_block:
                    content.append(('text', '\n'.join(current_block)))
                    current_block = []
                content.append(('h1', line[2:]))
            elif line.startswith('## '):
                if current_block:
                    content.append(('text', '\n'.join(current_block)))
                    current_block = []
                content.append(('h2', line[3:]))
            elif line.startswith('### '):
                if current_block:
                    content.append(('text', '\n'.join(current_block)))
                    current_block = []
                content.append(('h3', line[4:]))
            elif line.startswith('- ') or line.startswith('* '):
                content.append(('bullet', line[2:]))
            elif line.startswith('> '):
                content.append(('quote', line[2:]))
            elif line.strip():
                current_block.append(line)
            else:
                if current_block:
                    content.append(('text', '\n'.join(current_block)))
                    current_block = []
                content.append(('spacer', ''))

        if current_block:
            content.append(('text', '\n'.join(current_block)))
        if table_lines:
            content.append(('table', table_lines))

        return content

    def render_content(self, content):
        """Render parsed content to PDF"""
        self.add_page()

        for item_type, item_text in content:
            if item_type == 'h1':
                self.set_font('Arial', 'B', 18)
                self.set_text_color(31, 41, 55)
                self.ln(0.5)
                self.cell(0, 10, item_text, 0, 1)
                self.set_draw_color(59, 130, 246)
                self.line(10, self.get_y(), 200, self.get_y())
                self.ln(3)
                self.add_toc_entry(item_text, 1, self.page_no())

            elif item_type == 'h2':
                self.set_font('Arial', 'B', 14)
                self.set_text_color(31, 41, 55)
                self.ln(0.3)
                self.cell(0, 10, item_text, 0, 1)
                self.ln(2)
                self.add_toc_entry(item_text, 2, self.page_no())

            elif item_type == 'h3':
                self.set_font('Arial', 'B', 12)
                self.set_text_color(55, 65, 81)
                self.ln(0.2)
                self.cell(0, 9, item_text, 0, 1)
                self.ln(1)

            elif item_type == 'text':
                # Clean up markdown syntax
                clean_text = item_text.replace('**', '').replace('_', '')
                self.set_font('Arial', '', 10)
                self.set_text_color(51, 51, 51)
                self.multi_cell(0, 5, clean_text)
                self.ln(1)

            elif item_type == 'bullet':
                self.set_font('Arial', '', 10)
                self.set_text_color(51, 51, 51)
                self.cell(5, 5, u'\u2022', 0, 0)  # Bullet point
                self.multi_cell(0, 5, item_text)
                self.ln(0.5)

            elif item_type == 'quote':
                self.set_fill_color(240, 253, 244)
                self.set_draw_color(16, 185, 129)
                self.set_font('Arial', 'I', 9)
                self.set_text_color(34, 197, 94)
                self.multi_cell(0, 5, item_text, border=1, fill=True)
                self.ln(1)

            elif item_type == 'table':
                self.render_table(item_text)
                self.ln(2)

            elif item_type == 'spacer':
                self.ln(3)

            # Check if we need a new page
            if self.get_y() > 270:
                self.add_page()

    def render_table(self, table_lines):
        """Render markdown table to PDF"""
        if not table_lines or len(table_lines) < 2:
            return

        # Parse table
        header = [cell.strip() for cell in table_lines[0].split('|')[1:-1]]
        rows = []
        for line in table_lines[2:]:  # Skip separator row
            if '|' in line:
                row = [cell.strip() for cell in line.split('|')[1:-1]]
                if row:
                    rows.append(row)

        if not header or not rows:
            return

        # Render table
        self.set_font('Arial', 'B', 9)
        self.set_fill_color(59, 130, 246)
        self.set_text_color(255, 255, 255)

        col_width = (190 - 20) / len(header)

        # Header
        for cell in header:
            self.cell(col_width, 7, cell[:30], 1, 0, 'C', fill=True)
        self.ln()

        # Rows
        self.set_font('Arial', '', 8)
        self.set_text_color(51, 51, 51)
        for i, row in enumerate(rows):
            if i % 2:
                self.set_fill_color(249, 250, 251)
            else:
                self.set_fill_color(255, 255, 255)
            for cell in row:
                self.cell(col_width, 6, cell[:30], 1, 0, 'L', fill=True)
            self.ln()

        self.set_text_color(51, 51, 51)


def convert_file(filename):
    """Convert a single markdown file to PDF"""
    input_path = os.path.join(docs_dir, filename)
    output_path = os.path.join(docs_dir, filename.replace('.md', '-v1.pdf'))

    if not os.path.exists(input_path):
        print(f"[SKIP] File not found: {filename}")
        return False

    try:
        # Read file
        with open(input_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Create PDF
        title = filename.replace('.md', '').replace('-', ' ').title()
        pdf = MarkdownPDF()

        # Title page
        pdf.add_page()
        pdf.set_font('Arial', 'B', 28)
        pdf.set_text_color(31, 41, 55)
        pdf.ln(4)
        pdf.cell(0, 20, title, 0, 1, 'C')
        pdf.set_font('Arial', '', 12)
        pdf.set_text_color(100, 116, 139)
        pdf.cell(0, 10, 'Version 1', 0, 1, 'C')
        pdf.cell(0, 10, 'AECE Checkpoint', 0, 1, 'C')
        pdf.cell(0, 10, f'Generated: {datetime.now().strftime("%B %d, %Y")}', 0, 1, 'C')

        # Parse and render content
        parsed = pdf.parse_markdown(content)
        pdf.render_content(parsed)

        # Save
        pdf.output(output_path)
        print(f"[OK] Created: {os.path.basename(output_path)}")
        return True

    except Exception as e:
        print(f"[ERROR] Converting {filename}: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Convert all files"""
    print("Converting markdown to PDF with proper formatting...\n")

    for filename in files:
        convert_file(filename)

    print("\n[DONE] Conversion complete!")


if __name__ == '__main__':
    main()
