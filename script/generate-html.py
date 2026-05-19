#!/usr/bin/env python3
"""Generate print-friendly HTML from markdown"""

import os
import re
import markdown

script_dir = os.path.dirname(os.path.abspath(__file__))
docs_dir = os.path.join(script_dir, '..', 'docs', 'training')

files = [
    'hr-user-guide.md',
    'admin-reference-manual.md',
    'hr-quick-reference.md',
    'README.md'
]

HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - Version 1</title>
    <style>
        @page {{
            size: A4;
            margin: 2cm;
            @bottom-center {{
                content: "Page " counter(page) " of " counter(pages);
            }}
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 11pt;
        }}

        h1 {{
            font-size: 28pt;
            color: #1f2937;
            margin: 1em 0 0.5em 0;
            page-break-after: avoid;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 0.5em;
        }}

        h2 {{
            font-size: 18pt;
            color: #1f2937;
            margin: 1.5em 0 0.5em 0;
            page-break-after: avoid;
            border-left: 5px solid #3b82f6;
            padding-left: 0.5em;
        }}

        h3 {{
            font-size: 14pt;
            color: #374151;
            margin: 1em 0 0.4em 0;
            page-break-after: avoid;
        }}

        p {{
            margin: 0.5em 0;
        }}

        ul, ol {{
            margin: 0.5em 0 0.5em 2em;
        }}

        li {{
            margin: 0.3em 0;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1em 0;
            page-break-inside: avoid;
            font-size: 10pt;
        }}

        thead {{
            background-color: #3b82f6;
            color: white;
        }}

        th {{
            border: 1px solid #1f2937;
            padding: 0.5em;
            text-align: left;
            font-weight: bold;
        }}

        td {{
            border: 1px solid #d1d5db;
            padding: 0.5em;
        }}

        tbody tr:nth-child(even) {{
            background-color: #f9fafb;
        }}

        code {{
            background-color: #f3f4f6;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }}

        pre {{
            background-color: #1f2937;
            color: #e5e7eb;
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1em 0;
            page-break-inside: avoid;
            font-size: 9pt;
        }}

        pre code {{
            background: none;
            padding: 0;
            color: inherit;
        }}

        blockquote {{
            border-left: 4px solid #10b981;
            padding: 1em;
            margin: 1em 0;
            background-color: #f0fdf4;
            page-break-inside: avoid;
        }}

        .title-page {{
            text-align: center;
            padding-top: 8cm;
            page-break-after: always;
        }}

        .title-page h1 {{
            font-size: 36pt;
            margin-bottom: 1em;
            border: none;
            padding: 0;
        }}

        .title-page .version {{
            font-size: 14pt;
            color: #666;
            margin: 1em 0;
        }}

        .title-page .date {{
            font-size: 11pt;
            color: #999;
            margin-top: 2em;
        }}

        .toc {{
            page-break-after: always;
            margin-bottom: 2em;
        }}

        .toc h2 {{
            margin-top: 0;
        }}

        .toc ul {{
            list-style: none;
            padding: 0;
        }}

        .toc li {{
            margin: 0.3em 0;
            padding-left: 1.5em;
        }}

        .toc a {{
            color: #3b82f6;
            text-decoration: none;
        }}

        .toc a:hover {{
            text-decoration: underline;
        }}

        @media print {{
            body {{
                background: white;
            }}
            a {{
                color: #0066cc;
            }}
            h1, h2, h3, h4, h5, h6 {{
                page-break-after: avoid;
            }}
            table {{
                page-break-inside: avoid;
            }}
        }}
    </style>
</head>
<body>
    <div class="title-page">
        <h1>{title}</h1>
        <div class="version">Version 1</div>
        <div>AECE Checkpoint Training Documentation</div>
        <div class="date">Generated: {date}</div>
    </div>

    {content}

    <script>
        // Make heading links clickable
        document.querySelectorAll('h2, h3').forEach((heading, index) => {{
            const id = 'section-' + index;
            heading.id = id;
        }});
    </script>
</body>
</html>
'''

def markdown_to_html(md_text):
    """Convert markdown to HTML"""
    html = markdown.markdown(
        md_text,
        extensions=['tables', 'fenced_code', 'nl2br', 'sane_lists', 'extra', 'toc']
    )
    return html

def generate_toc(md_text):
    """Extract headings for table of contents"""
    lines = md_text.split('\n')
    toc = '<div class="toc"><h2>Table of Contents</h2><ul>'

    index = 0
    for line in lines:
        if line.startswith('## '):
            title = line[3:].strip()
            toc += f'<li><a href="#section-{index}">{title}</a></li>'
            index += 1
        elif line.startswith('### '):
            title = line[4:].strip()
            toc += f'<li style="margin-left: 1.5em;"><a href="#section-{index}">{title}</a></li>'
            index += 1

    toc += '</ul></div>'
    return toc

def convert_file(filename):
    """Convert markdown to HTML"""
    input_path = os.path.join(docs_dir, filename)
    output_path = os.path.join(docs_dir, filename.replace('.md', '-v1.html'))

    if not os.path.exists(input_path):
        print(f"[SKIP] {filename}")
        return False

    try:
        # Read markdown
        with open(input_path, 'r', encoding='utf-8') as f:
            md_text = f.read()

        # Generate TOC and convert
        toc = generate_toc(md_text)
        html_content = markdown_to_html(md_text)

        # Generate title
        from datetime import datetime
        title = filename.replace('.md', '').replace('-', ' ').title()
        date = datetime.now().strftime('%B %d, %Y')

        # Combine and save
        full_html = HTML_TEMPLATE.format(
            title=title,
            date=date,
            content=toc + html_content
        )

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_html)

        print(f"[OK] {os.path.basename(output_path)}")
        return True

    except Exception as e:
        print(f"[ERROR] {filename}: {e}")
        return False

def main():
    print("Generating print-friendly HTML files...\n")

    for filename in files:
        convert_file(filename)

    print("\n[DONE] HTML files ready!")
    print("\nTo convert to PDF:")
    print("1. Open the HTML file in a web browser")
    print("2. Press Ctrl+P (or Cmd+P on Mac)")
    print("3. Save as PDF")
    print("\nThis preserves formatting, tables, and page numbers.")

if __name__ == '__main__':
    main()
