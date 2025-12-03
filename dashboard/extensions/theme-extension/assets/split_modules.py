#!/usr/bin/env python3
"""
Script to split advanced-filter-search.js into smaller modules
for Shopify's 10KB file size limit.
"""

import re
import os

def read_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(filepath, content):
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def get_file_size_kb(filepath):
    return os.path.getsize(filepath) / 1024

def extract_section(content, start_pattern, end_pattern):
    """Extract a section between two patterns"""
    start_match = re.search(start_pattern, content)
    end_match = re.search(end_pattern, content)
    
    if not start_match or not end_match:
        return None
    
    start_pos = start_match.start()
    end_pos = end_match.end()
    
    return content[start_pos:end_pos]

def create_module_wrapper(name, content, dependencies=None):
    """Create a module wrapped in IIFE with dependencies"""
    deps_code = ""
    if dependencies:
        deps_code = "\n  // Dependencies\n"
        for dep in dependencies:
            deps_code += f"  const {dep} = global.AFS?.{dep} || {{}};\n"
    
    return f"""/**
 * Advanced Filter Search - {name}
 * Auto-generated module
 */
(function(global) {{
  'use strict';
{deps_code}
{content}
  
  // Expose to global namespace
  if (typeof window !== 'undefined') {{
    window.AFS = window.AFS || {{}};
    // Module exports will be added here
  }} else if (typeof global !== 'undefined') {{
    global.AFS = global.AFS || {{}};
    // Module exports will be added here
  }}
  
}})(typeof window !== 'undefined' ? window : this);
"""

def main():
    input_file = 'advanced-filter-search.js'
    output_dir = '.'
    
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found")
        return
    
    content = read_file(input_file)
    
    # Define sections to extract
    sections = [
        {
            'name': 'Utils',
            'start': r'const Utils = \{',
            'end': r'^\s*\};',
            'file': 'afs-utils.js',
            'exports': ['Utils']
        },
        {
            'name': 'StateManager',
            'start': r'const StateManager = \{',
            'end': r'^\s*\};',
            'file': 'afs-state.js',
            'exports': ['StateManager'],
            'dependencies': ['CONSTANTS', 'Logger']
        },
        {
            'name': 'URLManager',
            'start': r'const URLManager = \{',
            'end': r'^\s*\};',
            'file': 'afs-url.js',
            'exports': ['URLManager'],
            'dependencies': ['CONSTANTS', 'Utils', 'StateManager', 'Logger']
        },
    ]
    
    print("Module splitting tool")
    print("=" * 50)
    print(f"Input file: {input_file}")
    print(f"File size: {get_file_size_kb(input_file):.2f} KB")
    print()
    
    for section in sections:
        extracted = extract_section(content, section['start'], section['end'])
        if extracted:
            module_content = create_module_wrapper(
                section['name'],
                extracted,
                section.get('dependencies')
            )
            
            # Add exports
            exports_code = ""
            for export_name in section['exports']:
                exports_code += f"    window.AFS.{export_name} = {export_name};\n"
            
            module_content = module_content.replace(
                "    // Module exports will be added here",
                exports_code.rstrip()
            )
            
            output_path = os.path.join(output_dir, section['file'])
            write_file(output_path, module_content)
            
            size_kb = get_file_size_kb(output_path)
            status = "✓" if size_kb <= 10 else "⚠"
            print(f"{status} {section['file']}: {size_kb:.2f} KB")
        else:
            print(f"✗ {section['file']}: Section not found")

if __name__ == '__main__':
    main()

