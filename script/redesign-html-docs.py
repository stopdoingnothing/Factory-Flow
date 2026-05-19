#!/usr/bin/env python3
"""Redesign remaining HTML training documents with professional styling"""

import os
import markdown

script_dir = os.path.dirname(os.path.abspath(__file__))
docs_dir = os.path.join(script_dir, '..', 'docs', 'training')

files_to_process = [
    ('admin-reference-manual.md', 'Admin Reference Manual'),
    ('hr-quick-reference.md', 'HR Quick Reference'),
    ('README.md', 'Training Documentation')
]

HTML_WRAPPER = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - Version 1</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Source+Sans+Pro:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        @page {{
            size: A4;
            margin: 2.5cm 2cm;
            @bottom-center {{
                content: counter(page);
                font-family: 'Source Sans Pro', sans-serif;
                font-size: 10px;
                color: #666;
            }}
            @top-right {{
                content: "AECE Checkpoint";
                font-family: 'Source Sans Pro', sans-serif;
                font-size: 9px;
                color: #999;
            }}
        }}

        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        html, body {{
            height: 100%;
        }}

        body {{
            font-family: 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            line-height: 1.7;
            color: #2c3e50;
            font-size: 11pt;
            background: #fafbfc;
        }}

        .title-page {{
            page-break-after: always;
            padding: 4cm 0 0 0;
            text-align: center;
            background: linear-gradient(135deg, #1a365d 0%, #2d5a8c 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }}

        .title-page h1 {{
            font-family: 'Merriweather', serif;
            font-size: 48pt;
            font-weight: 700;
            margin-bottom: 0.5em;
            letter-spacing: -0.5px;
        }}

        .title-page .subtitle {{
            font-size: 14pt;
            font-weight: 400;
            opacity: 0.95;
            margin-bottom: 1.5em;
            letter-spacing: 1px;
        }}

        .title-page .meta {{
            opacity: 0.8;
            font-size: 11pt;
            line-height: 1.8;
        }}

        .toc {{
            page-break-after: always;
            padding: 2cm 0;
            background: #f8f9fa;
        }}

        .toc h2 {{
            font-family: 'Merriweather', serif;
            font-size: 28pt;
            color: #1a365d;
            margin-bottom: 1.5em;
            border-bottom: 3px solid #d97706;
            padding-bottom: 0.5em;
        }}

        .toc-content {{
            column-count: 2;
            column-gap: 2em;
        }}

        .toc ul {{
            list-style: none;
            padding: 0;
        }}

        .toc li {{
            margin: 0.7em 0;
            padding-left: 0;
        }}

        .toc li a {{
            color: #2c3e50;
            text-decoration: none;
            font-weight: 500;
            border-bottom: 1px dotted #d97706;
        }}

        .toc-level-2 {{
            margin-left: 1.5em;
            font-size: 10pt;
            color: #555;
        }}

        .content {{
            background: white;
            padding: 0;
        }}

        h1 {{
            font-family: 'Merriweather', serif;
            font-size: 32pt;
            color: #1a365d;
            margin: 2em 0 1em 0;
            page-break-after: avoid;
            border-bottom: 2px solid #d97706;
            padding-bottom: 0.4em;
            letter-spacing: -0.5px;
        }}

        h2 {{
            font-family: 'Merriweather', serif;
            font-size: 22pt;
            color: #1a365d;
            margin: 1.8em 0 0.8em 0;
            page-break-after: avoid;
            border-left: 4px solid #d97706;
            padding-left: 0.8em;
            letter-spacing: -0.3px;
        }}

        h3 {{
            font-family: 'Source Sans Pro', sans-serif;
            font-size: 14pt;
            color: #2c3e50;
            margin: 1.3em 0 0.6em 0;
            page-break-after: avoid;
            font-weight: 600;
        }}

        h4 {{
            font-size: 12pt;
            color: #34495e;
            margin: 1em 0 0.5em 0;
            font-weight: 600;
        }}

        p {{
            margin: 0.8em 0;
            text-align: justify;
        }}

        a {{
            color: #2980b9;
            text-decoration: none;
            border-bottom: 1px solid #e8e8e8;
        }}

        ul, ol {{
            margin: 1em 0 1em 2em;
            padding: 0;
        }}

        li {{
            margin: 0.5em 0;
            line-height: 1.7;
        }}

        li p {{
            margin: 0.3em 0;
        }}

        code {{
            font-family: 'Courier New', monospace;
            font-size: 10pt;
            background-color: #f5f5f5;
            padding: 0.2em 0.5em;
            border-radius: 3px;
            color: #e83e8c;
        }}

        pre {{
            background-color: #2c3e50;
            color: #ecf0f1;
            padding: 1.2em;
            border-radius: 4px;
            overflow-x: auto;
            margin: 1.2em 0;
            page-break-inside: avoid;
            font-size: 9.5pt;
            line-height: 1.5;
            border-left: 4px solid #d97706;
        }}

        pre code {{
            background: none;
            padding: 0;
            color: inherit;
        }}

        blockquote {{
            border-left: 4px solid #d97706;
            padding: 1em 1.2em;
            margin: 1.2em 0;
            background-color: #fffbf0;
            page-break-inside: avoid;
            font-style: italic;
            color: #555;
        }}

        blockquote p {{
            margin: 0.5em 0;
            text-align: left;
        }}

        blockquote strong {{
            font-weight: 600;
            color: #1a365d;
            font-style: normal;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1.5em 0;
            page-break-inside: avoid;
            font-size: 10pt;
            background: white;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }}

        thead {{
            background: linear-gradient(135deg, #1a365d 0%, #2d5a8c 100%);
            color: white;
        }}

        th {{
            padding: 0.8em 0.9em;
            text-align: left;
            font-weight: 700;
            letter-spacing: 0.3px;
            border: none;
        }}

        tbody tr {{
            border-bottom: 1px solid #e0e0e0;
        }}

        tbody tr:nth-child(odd) {{
            background-color: #f9fbfd;
        }}

        tbody tr:nth-child(even) {{
            background-color: #ffffff;
        }}

        tbody tr:hover {{
            background-color: #f0f5ff;
        }}

        td {{
            padding: 0.8em 0.9em;
            border: none;
        }}

        strong {{
            font-weight: 700;
            color: #1a365d;
        }}

        em {{
            font-style: italic;
            color: #34495e;
        }}

        .note, .warning, .admin-only {{
            margin: 1.2em 0;
            padding: 1em 1.2em;
            page-break-inside: avoid;
            border-left: 4px solid;
            border-radius: 2px;
        }}

        .note {{
            background-color: #e3f2fd;
            border-color: #2196f3;
        }}

        .note strong {{
            color: #1976d2;
        }}

        .warning {{
            background-color: #fff3e0;
            border-color: #ff9800;
        }}

        .warning strong {{
            color: #e65100;
        }}

        .admin-only {{
            background-color: #f3e5f5;
            border-color: #9c27b0;
        }}

        .admin-only strong {{
            color: #7b1fa2;
        }}

        hr {{
            border: none;
            border-top: 2px solid #d97706;
            margin: 2em 0;
            opacity: 0.5;
        }}

        .section-break {{
            page-break-before: always;
            padding-top: 1em;
        }}

        .page-break {{
            page-break-after: always;
        }}

        @media print {{
            body {{
                background: white;
            }}

            a {{
                color: #2980b9;
                text-decoration: underline;
                border: none;
            }}

            h1, h2, h3, h4, h5, h6 {{
                page-break-after: avoid;
                orphans: 2;
                widows: 2;
            }}

            p, li {{
                orphans: 2;
                widows: 2;
            }}

            table {{
                page-break-inside: avoid;
            }}

            tr {{
                page-break-inside: avoid;
            }}
        }}

        .toc, .note, .warning, .admin-only, table {{
            page-break-inside: avoid;
        }}
    </style>
</head>
<body>
    <div class="title-page">
        <h1>{title}</h1>
        <div class="subtitle">AECE Checkpoint Training Documentation</div>
        <div class="meta">
            Version 1<br>
            Complete Reference<br>
            <br>
            Generated April 2026
        </div>
    </div>

    <div class="toc">
        <h2>Contents</h2>
        <div class="toc-content">
            {toc}
        </div>
    </div>

    <div class="content">
        {content}
    </div>

    <p style="text-align: center; font-size: 9pt; color: #999; margin: 3em 0 1em 0; page-break-before: always;">
        <strong>AECE Checkpoint Training Documentation – Version 1</strong><br>
        This document is confidential and intended for AECE Checkpoint users only.<br>
        Last updated: April 2026
    </p>
</body>
</html>'''

def markdown_to_html(md_text):
    """Convert markdown to HTML"""
    html = markdown.markdown(
        md_text,
        extensions=['tables', 'fenced_code', 'nl2br', 'sane_lists', 'extra']
    )
    return html

def generate_toc_from_html(html_content):
    """Extract headings from HTML for TOC"""
    import re
    headings = re.findall(r'<h([1-3])>(.*?)</h\1>', html_content)

    toc = '<ul>\n'
    for level, text in headings:
        text_clean = re.sub(r'<[^>]+>', '', text)
        level_int = int(level)
        indent = '  ' * (level_int - 1)
        toc += f'{indent}<li>'
        if level_int == 1:
            toc += f'<strong>{text_clean}</strong>'
        else:
            toc += text_clean
        toc += '</li>\n'
    toc += '</ul>\n'
    return toc

def process_file(md_file, title):
    """Process a markdown file and create redesigned HTML"""
    input_path = os.path.join(docs_dir, md_file)
    output_path = os.path.join(docs_dir, md_file.replace('.md', '-v1.html'))

    if not os.path.exists(input_path):
        print(f"[SKIP] {md_file}")
        return False

    try:
        # Read markdown
        with open(input_path, 'r', encoding='utf-8') as f:
            md_text = f.read()

        # Convert to HTML
        html_content = markdown_to_html(md_text)

        # Generate TOC
        toc = generate_toc_from_html(html_content)

        # Create full HTML
        full_html = HTML_WRAPPER.format(
            title=title,
            toc=toc,
            content=html_content
        )

        # Write output
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(full_html)

        print(f"[OK] {os.path.basename(output_path)}")
        return True

    except Exception as e:
        print(f"[ERROR] {md_file}: {e}")
        return False

def main():
    print("Redesigning HTML training documents...\n")

    for md_file, title in files_to_process:
        process_file(md_file, title)

    print("\n[DONE] All documents redesigned!")
    print("\nDocuments are ready to print to PDF:")
    print("1. Open any HTML file in a browser")
    print("2. Press Ctrl+P (Cmd+P on Mac)")
    print("3. Save as PDF")

if __name__ == '__main__':
    main()
