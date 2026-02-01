# Example Command to run this script from your terminal:
# python3 journal_parser.py --working_dir ./input_journal_files --output_dir ./parsed_journal_entries
#

import argparse
import os
import re
import glob
import pandas as pd
from dateutil.parser import parse as date_parse, ParserError
from datetime import datetime
from tqdm import tqdm
import logging

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def correct_common_typos(text):
    corrections = {"Uagast": "August", "Des": "Dec", "Fr": "Fri", "Tues": "Tue"}
    for typo, correction in corrections.items():
        text = re.sub(r'\b' + re.escape(typo) + r'\b', correction, text, flags=re.IGNORECASE)
    return text

def parse_journal_entries(file_content, source_filename):
    entries = {}
    
    # --- CHANGED: A significantly more robust pattern to split entries ---
    # This now correctly handles the different markdown prefixes for the "Xander Wiles" format.
    entry_start_pattern = re.compile(
        r'\n\s*(?=(?:'
        r'(?:\*\*?)\+\+|'  # Format 1: Starts with ++ or **++
        r'(?:(?:## )?\*\*?)Xander(?: Wiles)?.*?:'  # Format 2: Starts with optional markdown + Xander Wiles + colon
        r'))',
        re.DOTALL | re.IGNORECASE
    )
    potential_blocks = entry_start_pattern.split(file_content)
    
    # Discard the first block if it's a file header and not a real entry
    if potential_blocks and not re.match(r'^\s*(?:\*\*?\+\+|(?:(?:## )?\*\*?)Xander)', potential_blocks[0], re.IGNORECASE):
        potential_blocks = potential_blocks[1:]

    months_pattern = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
    
    date_regex_full = re.compile(
        r'((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s*,?\s*)?\d{1,2}(?:st|nd|rd|th)?\s+'
        rf'{months_pattern}'
        r'(?:\s+\d{2,4})?)',
        re.IGNORECASE
    )
    date_regex_no_month = re.compile(r'((?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s*,?\s*)?\d{1,2}(?:st|nd|rd|th)?\s+\d{4})', re.IGNORECASE)
    year_check_regex = re.compile(r'\b\d{4}\b')

    for block in potential_blocks:
        block = block.strip()
        if not block: continue

        try:
            date_str_found = None
            year_was_inferred = False
            
            search_areas = [block[:300], block[-200:]]
            
            for area in search_areas:
                match = date_regex_full.search(area) or date_regex_no_month.search(area)
                if match:
                    date_str_found = match.group(1).strip()
                    break
            
            if not date_str_found: continue

            if not year_check_regex.search(date_str_found):
                year_from_file = re.search(r'(\d{4})', source_filename)
                if year_from_file:
                    default_date = datetime(int(year_from_file.group(1)), 1, 1)
                    entry_date = date_parse(date_str_found, default=default_date)
                    year_was_inferred = True
                else: raise ParserError("No year in date and could not infer from filename.")
            else:
                entry_date = date_parse(date_str_found)
            
            if not (1950 < entry_date.year < 2100): continue

            entry_date_key = entry_date.date()
            
            title = block.split('\n')[0] # The title is the full original header line
            
            if entry_date_key not in entries: entries[entry_date_key] = []
            entries[entry_date_key].append({'title': title, 'text': block, 'year_inferred': year_was_inferred})

        except ParserError as e:
            logging.warning(f"Skipping block, could not parse date: '{block[:100].replace(chr(10), ' ')}...' Reason: {e}")
            
    return entries

def create_activity_csv(entries_dict, output_dir, file_name="journal_activity_log.csv"):
    if not entries_dict:
        logging.error("Cannot create CSV: No entries were provided.")
        return
    logging.info("Creating CSV activity log...")
    start_date, end_date = min(entries_dict.keys()), max(entries_dict.keys())
    date_range = pd.date_range(start=start_date, end=end_date, freq='D')
    rows = []
    for date in date_range:
        date_key = date.date()
        entries_for_day = entries_dict.get(date_key)
        formatted_date = date.strftime('%A %d %B %Y')
        if entries_for_day:
            entry_found_marker = 'O' if len(entries_for_day) > 1 else '/'
            titles = " | ".join(filter(None, [e['title'] for e in entries_for_day]))
            texts = [e['text'] for e in entries_for_day]
            full_text = "\n\n---\n\n".join(texts)
            sources = ", ".join(set([e['source_file'] for e in entries_for_day]))
            year_inferred = any(e.get('year_inferred', False) for e in entries_for_day)
            rows.append([formatted_date, date.strftime('%A'), entry_found_marker, titles, full_text, sources, "Yes" if year_inferred else "No"])
        else:
            rows.append([formatted_date, date.strftime('%A'), 'X', '', '', '', 'No'])
    df = pd.DataFrame(rows, columns=['Date', 'Day of Week', 'Entry Found', 'Title', 'Entry Text', 'Source File', 'Year Inferred'])
    df['Total Found Entries'] = (df['Entry Found'] != 'X').cumsum()
    output_path = os.path.join(output_dir, file_name)
    df.to_csv(output_path, index=False)
    logging.info(f"Successfully created CSV log at: {output_path}")

def create_markdown_files(entries_dict, output_dir):
    if not entries_dict: return
    logging.info("Creating individual Markdown files for each entry...")
    os.makedirs(output_dir, exist_ok=True)
    
    for entry_date in tqdm(sorted(entries_dict.keys()), desc="Writing Markdown Files"):
        entries_for_day = entries_dict[entry_date]
        file_name = f"{entry_date.strftime('%Y-%m-%d')}.md"
        file_path = os.path.join(output_dir, file_name)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"# {entry_date.strftime('%A, %d %B %Y')}\n\n")
            
            for i, entry_data in enumerate(entries_for_day):
                if i > 0: f.write("\n\n---\n\n")
                
                source_file = entry_data.get('source_file', 'Unknown')
                f.write(f"<!-- Source: {source_file} -->\n")
                
                # --- CHANGED: This logic is now simpler and avoids duplication ---
                # It writes the entire original block as is, which is what we want.
                f.write(entry_data['text'])

    logging.info(f"Successfully created {len(entries_dict)} Markdown files in: {output_dir}")

def main():
    parser = argparse.ArgumentParser(description="Parse journal markdown files.")
    parser.add_argument('--working_dir', required=True, help="Directory containing input files (searches recursively).")
    parser.add_argument('--output_dir', required=True, help="Directory where parsed files and CSV will be saved.")
    args = parser.parse_args()
    os.makedirs(args.output_dir, exist_ok=True)
    search_pattern = os.path.join(args.working_dir, '**', '*.md')
    md_files = glob.glob(search_pattern, recursive=True)
    if not md_files:
        logging.error(f"No .md files found in the specified directory: {args.working_dir}")
        return
    logging.info(f"Found {len(md_files)} markdown files to process (searching recursively).")
    all_parsed_entries = {}
    for md_file in tqdm(md_files, desc="Processing Files"):
        source_filename = os.path.basename(md_file)
        try:
            with open(md_file, 'r', encoding='utf-8') as f: content = f.read()
            corrected_text = correct_common_typos(content)
            entries_from_file = parse_journal_entries(corrected_text, source_filename)
            if entries_from_file:
                for date_key, data_list in entries_from_file.items():
                    for data in data_list: data['source_file'] = source_filename
                    if date_key not in all_parsed_entries: all_parsed_entries[date_key] = []
                    all_parsed_entries[date_key].extend(data_list)
        except Exception as e:
            logging.error(f"Could not read or process file {md_file}: {e}")
    if all_parsed_entries:
        logging.info(f"Successfully parsed a total of {sum(len(v) for v in all_parsed_entries.values())} entries for {len(all_parsed_entries)} unique dates.")
        create_activity_csv(all_parsed_entries, args.output_dir)
        md_output_path = os.path.join(args.output_dir, 'daily_entries')
        create_markdown_files(all_parsed_entries, md_output_path)
        logging.info("Processing complete.")
    else:
        logging.error("Failed to parse any entries. Exiting.")

if __name__ == "__main__":
    main()