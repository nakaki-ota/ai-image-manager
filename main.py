import os
import glob
import json
import datetime
import aiosqlite
import re
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import asyncio

app = FastAPI()

# CORS設定
origins = [
    "http://localhost",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_PATH = "db/image_metadata.db"

class RatingUpdate(BaseModel):
    rating: Optional[float] = None

# 静的ファイル（画像）を提供するための設定
app.mount("/images", StaticFiles(directory="images"), name="images")

# 新しいエンドポイントを追加
@app.post("/api/images/sync")
async def sync_images_to_db():
    """
    Scans the images directory and updates the database with image metadata.
    """
    print("--- Starting database sync ---")

    db_dir = os.path.dirname(DATABASE_PATH)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir)
        print(f"Created database directory: {db_dir}")

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # テーブル存在チェックはAlembicに任せるため削除

        cursor = await db.execute("SELECT image_path FROM images")
        existing_paths = {row[0] for row in await cursor.fetchall()}
        
        image_files = glob.glob(os.path.join("images", "**", "*.png"), recursive=True)
        new_files = [f for f in image_files if os.path.relpath(f, "images") not in existing_paths]
        print(f"Found {len(new_files)} new images to process.")
        
        synced_count = 0
        
        for file_path in new_files:
            relative_path = os.path.relpath(file_path, "images")
            filename = os.path.basename(file_path)
            prompt = ""
            negative_prompt = ""
            parameters = "{}"

            try:
                # Read metadata from JSON file
                metadata_path = os.path.join("images", os.path.splitext(filename)[0] + ".json")
                if os.path.exists(metadata_path):
                    with open(metadata_path, 'r', encoding='utf-8') as f:
                        metadata = json.load(f)
                    prompt = metadata.get("prompt", "")
                    negative_prompt = metadata.get("negative_prompt", "")
                    parameters = json.dumps(metadata.get("parameters", {}))
                    print(f"Metadata loaded from JSON for: {filename}")
            except Exception as e:
                print(f"Error processing JSON metadata for {filename}: {e}")

            try:
                await db.execute(
                    """
                    INSERT INTO images (
                        filename, image_path, created_at, prompt, negative_prompt, parameters, rating
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (filename, relative_path, datetime.datetime.now(), prompt, negative_prompt, parameters, 0)
                )
                print(f"Successfully inserted {filename} into database.")
                synced_count += 1
            except Exception as e:
                print(f"Error inserting {filename} into database: {e}")

        await db.commit()
    print(f"--- Database sync complete. Synced {synced_count} new images. ---")
    return {"message": f"Synced {synced_count} new images."}

@app.get("/api/images")
async def list_images_and_search(query: Optional[str] = None):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        if query:
            search_query = f"%{query}%"
            cursor = await db.execute(
                """
                SELECT
                    id, filename, image_path, rating
                FROM
                    images
                WHERE
                    prompt LIKE ? OR negative_prompt LIKE ?
                """,
                (search_query, search_query)
            )
        else:
            cursor = await db.execute("SELECT id, filename, image_path, rating FROM images")
        
        rows = await cursor.fetchall()
        
        images = []
        for row in rows:
            images.append({
                "id": row[0],
                "filename": row[1],
                "image_path": row[2],
                "rating": row[3],
            })
            
        return {"images": images}

@app.put("/api/images/{image_id}/rate")
async def update_image_rating(image_id: int, rating_update: RatingUpdate):
    if not rating_update.rating or rating_update.rating < 0 or rating_update.rating > 5:
        raise HTTPException(status_code=400, detail="Invalid rating value")

    try:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            await db.execute(
                "UPDATE images SET rating = ? WHERE id = ?",
                (rating_update.rating, image_id)
            )
            await db.commit()
        return {"message": f"Image {image_id} rating updated successfully."}
    except Exception as e:
        print(f"An error occurred while updating rating for image_id={image_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rating.")