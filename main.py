import os
import glob
import json
import datetime
import aiosqlite
import re
from PIL import Image
import png
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# CORS設定
origins = [
    "http://localhost",
    "http://localhost:5173", # Viteのデフォルトポート
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_PATH = "ai_images.db"

# 静的ファイル（画像）を提供するための設定
app.mount("/images", StaticFiles(directory="images"), name="images")

@app.get("/api/images")
async def list_images_and_search(query: Optional[str] = None):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        if query:
            search_query = f"%{query}%"
            cursor = await db.execute(
                """
                SELECT
                    id,
                    filename,
                    image_path
                FROM
                    images
                WHERE
                    prompt LIKE ? OR negative_prompt LIKE ?
                """,
                (search_query, search_query)
            )
        else:
            cursor = await db.execute("SELECT id, filename, image_path FROM images")
        
        rows = await cursor.fetchall()
        
        images = []
        for row in rows:
            images.append({
                "id": row[0],
                "filename": row[1],
                "image_path": row[2]
            })
            
        return {"images": images}

@app.get("/api/images/{image_id}")
async def get_image_details(image_id: int):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        image_cursor = await db.execute("SELECT * FROM images WHERE id = ?", (image_id,))
        image_row = await image_cursor.fetchone()
        
        if not image_row:
            raise HTTPException(status_code=404, detail="Image not found")
        
        return {
            "id": image_row[0],
            "filename": image_row[1],
            "image_path": image_row[2],
            "rating": image_row[3],
            "created_at": image_row[4],
            "metadata": {
                "prompt": image_row[5],
                "negative_prompt": image_row[6],
                "parameters": image_row[7]
            }
        }

@app.post("/api/images/sync")
async def sync_images():
    print("--- Sync process started ---")
    async with aiosqlite.connect(DATABASE_PATH) as db:
        print(f"Connected to database at: {DATABASE_PATH}")

        cursor = await db.execute("SELECT image_path FROM images")
        existing_paths = {row[0] for row in await cursor.fetchall()}
        print(f"Found {len(existing_paths)} existing images in the database.")

        image_files = glob.glob(os.path.join("images", "**", "*.png"), recursive=True)
        new_files = [f for f in image_files if os.path.relpath(f, "images") not in existing_paths]
        print(f"Found {len(new_files)} new files to process.")
        
        synced_count = 0

        for file_path in new_files:
            relative_path = os.path.relpath(file_path, "images")
            print(f"Processing new file: {relative_path}")
            
            metadata_text = ""
            
            try:
                reader = png.Reader(filename=file_path)
                for chunk_type, chunk_data in reader.chunks():
                    if chunk_type == b'tEXt':
                        key_value_pair = chunk_data.decode('latin-1').split('\x00', 1)
                        if len(key_value_pair) == 2 and key_value_pair[0] == 'parameters':
                            metadata_text = key_value_pair[1]
                            print("PyPNG: Succeeded.")
                            break
            except Exception as e:
                print(f"PyPNG: Failed with error: {e}")

            # データベースへの挿入ロジック
            try:
                if metadata_text:
                    await db.execute(
                        """
                        INSERT INTO images (
                            filename, image_path, created_at, prompt
                        ) VALUES (?, ?, ?, ?)
                        """,
                        (os.path.basename(file_path), relative_path, datetime.datetime.now(),
                            metadata_text)
                    )
                    print(f"Successfully inserted metadata into prompt for: {relative_path}")
                else:
                    print(f"No metadata found for: {relative_path}. Registering file path only.")
                    await db.execute(
                        """
                        INSERT INTO images (
                            filename, image_path, created_at
                        ) VALUES (?, ?, ?)
                        """,
                        (os.path.basename(file_path), relative_path, datetime.datetime.now())
                    )

                synced_count += 1
            
            except Exception as e:
                print(f"Error inserting into database: {e}")
        
        await db.commit()
        print(f"Database commit successful. Total synced: {synced_count}")

    print("--- Sync process finished ---")
    return {"message": f"Synced {synced_count} new images."}