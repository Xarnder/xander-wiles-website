import os
import glob
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

# USER INSTRUCTION:
# 1. Place your serviceAccountKey.json in this directory.
# 2. Run: pip install firebase-admin
# 3. Run: python3 migrate_to_firebase.py

# Path to service account key
SERVICE_ACCOUNT_KEY = 'serviceAccountKey.json'

INPUT_DIR = './parsed_journal_entries/daily_entries'

def upload_entries():
    if not os.path.exists(SERVICE_ACCOUNT_KEY):
        print(f"Error: {SERVICE_ACCOUNT_KEY} not found. Please download it from Firebase Console project settings -> Service Accounts.")
        return

    # Ask for User UID to ensure data goes to the right place
    print("\nIMPORTANT: You need your User UID from the PWA or Firebase Console.")
    print("This ensures the entries are linked to YOUR account.")
    user_uid = input("Enter your User UID: ").strip()
    
    if not user_uid:
        print("Error: User UID is required.")
        return

    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    files = glob.glob(os.path.join(INPUT_DIR, '*.md'))
    print(f"Found {len(files)} files to process in {INPUT_DIR}.")
    
    batch = db.batch()
    batch_count = 0
    total_uploaded = 0

    print(f"Uploading entries to: users/{user_uid}/entries")

    for file_path in files:
        filename = os.path.basename(file_path)
        doc_id = filename.replace('.md', '') # YYYY-MM-DD
        
        try:
             # Validate date
            date_obj = datetime.strptime(doc_id, '%Y-%m-%d')
        except ValueError:
            print(f"Skipping {filename}: Invalid date format")
            continue

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extract title if possible (first line)
        lines = content.split('\n')
        title = ""
        body_content = content
        
        # The existing parser adds a header line like "# Sunday, 01 January 2023"
        # We'll treat that as the "title" but also strip it from the body to avoid duplication in UI
        if lines and lines[0].startswith('# '):
            title = lines[0].replace('# ', '').strip()
            body_content = '\n'.join(lines[1:]).strip()
            
        # CHANGED: Path is now users/{uid}/entries/{date}
        doc_ref = db.collection('users').document(user_uid).collection('entries').document(doc_id)
        
        data = {
            'date': date_obj,
            'title': title, 
            'content': body_content,
            'userId': user_uid, # Redundant but helpful for querying if needed later
            'createdAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP
        }
        
        batch.set(doc_ref, data)
        batch_count += 1
        total_uploaded += 1

        if batch_count >= 400: # Firestore batch limit is 500
            batch.commit()
            print(f"Committed batch of {batch_count} entries...")
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()
        print(f"Committed final batch of {batch_count} entries.")

    print(f"Migration complete. Uploaded {total_uploaded} entries.")

if __name__ == '__main__':
    upload_entries()
