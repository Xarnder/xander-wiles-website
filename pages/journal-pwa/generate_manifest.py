#!/usr/bin/env python3
#
# --- Journal Manifest Generator ---
#
# Scans a directory for journal entries (.md files) and creates a sorted
# manifest file for the JournalViewer web application.
#
# Example Usage (from the JournalViewer root directory):
#   python3 generate_manifest.py
#
# Example with custom arguments:
#   python3 generate_manifest.py --entries_dir "path/to/my/entries"
#   python3 generate_manifest.py --entries_dir "parsed_journal_entries/daily_entries"

import argparse
import sys
from pathlib import Path
from tqdm import tqdm

def create_manifest(working_dir: Path, entries_dir_name: str, output_location: Path):
    """
    Finds all .md files, extracts their dates, sorts them, and writes to a manifest file.
    """
    print(f"DEBUG: Using working directory: '{working_dir.resolve()}'")
    
    # 1. Validate that the entries directory exists
    entries_path = working_dir / entries_dir_name
    if not entries_path.is_dir():
        print(f"ERROR: The entries directory was not found at '{entries_path.resolve()}'.", file=sys.stderr)
        print("Please make sure the directory exists and the --working_dir is correct.", file=sys.stderr)
        sys.exit(1)
    
    print(f"DEBUG: Scanning for .md files in: '{entries_path.resolve()}'")

    # 2. Find all .md files recursively
    try:
        # Using a list comprehension to gather files first for an accurate tqdm count
        files_to_process = [file for file in entries_path.glob('**/*.md') if file.is_file()]
        if not files_to_process:
            print(f"WARNING: No .md files were found in '{entries_path.resolve()}'. The manifest will be empty.")
            
        # Use the file's "stem" (filename without extension) as the date
        dates = [file.stem for file in tqdm(files_to_process, desc="Processing entries")]
        
        # 3. Sort the dates chronologically
        dates.sort()

    except Exception as e:
        print(f"ERROR: An unexpected error occurred while scanning for files: {e}", file=sys.stderr)
        sys.exit(1)

    # 4. Create the output directory if it doesn't exist
    output_dir = output_location.parent
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        print(f"DEBUG: Ensured output directory exists at '{output_dir.resolve()}'")
    except OSError as e:
        print(f"ERROR: Could not create output directory '{output_dir.resolve()}': {e}", file=sys.stderr)
        sys.exit(1)

    # 5. Write the sorted list to the manifest file
    try:
        with open(output_location, 'w') as f:
            for date in dates:
                f.write(f"{date}\n")
    except IOError as e:
        print(f"ERROR: Could not write to manifest file '{output_location.resolve()}': {e}", file=sys.stderr)
        sys.exit(1)

    print("\n✅ Success!")
    print(f"   Found and processed {len(dates)} journal entries.")
    print(f"   Manifest saved to: '{output_location.resolve()}'")
    print("   You can now refresh your JournalViewer webpage.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate a file manifest for the JournalViewer web app."
    )
    
    parser.add_argument(
        '--working_dir',
        type=str,
        default='.',
        help="The root directory of the JournalViewer project. Defaults to the current directory."
    )
    
    parser.add_argument(
        '--entries_dir',
        type=str,
        # --- THIS IS THE MODIFIED LINE ---
        default='parsed_journal_entries/daily_entries',
        help="The name of the directory containing the .md journal files."
    )
    
    parser.add_argument(
        '--output_location',
        type=str,
        default=None,
        help="Full path for the output manifest file. Defaults to 'file-manifest.txt' inside the working directory."
    )

    args = parser.parse_args()

    # Convert string paths to Path objects for easier manipulation
    working_dir_path = Path(args.working_dir)
    
    if args.output_location:
        output_path = Path(args.output_location)
    else:
        # If no output location is specified, default it to the working directory
        output_path = working_dir_path / 'file-manifest.txt'

    create_manifest(working_dir_path, args.entries_dir, output_path)