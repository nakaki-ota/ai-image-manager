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
from PIL import Image
from PIL.PngImagePlugin import PngImageFile
import png # PyPNGをインポート

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
IMAGE_DIR = "images"

class RatingUpdate(BaseModel):
    rating: int

# 静的ファイル（画像）を提供するための設定
app.mount("/images", StaticFiles(directory=IMAGE_DIR), name="images")

@app.on_event("startup")
async def startup_event():
    db_dir = os.path.dirname(DATABASE_PATH)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir)

# 画像のメタデータを抽出するヘルパー関数
def extract_metadata(file_path: str):
    """
    PNG画像からPyPNGを使用してメタデータを抽出し、生のテキストとして返します。
    """
    prompt = ""
    negative_prompt = ""
    parameters_raw = ""

    try:
        with open(file_path, 'rb') as f:
            reader = png.Reader(file=f)
            
            for chunk_type, chunk_data in reader.chunks():
                if chunk_type == b'tEXt':
                    text_str = chunk_data.decode('latin-1')
                    key, value = text_str.split('\x00', 1)
                    
                    if key == "parameters":
                        parameters_raw = value.strip()
                        lines = parameters_raw.split('\n')
                        if lines and lines[0]:
                            # 最初の行をプロンプトとする
                            prompt = lines[0].strip()
                        
                        # ネガティブプロンプトを抽出
                        for line in lines[1:]:
                            if line.startswith("Negative prompt:"):
                                negative_prompt = line.replace("Negative prompt:", "").strip()
                    
                    # 'prompt'と'negative_prompt'が個別チャンクにある場合も考慮
                    elif key == "prompt":
                        prompt = value.strip()
                    elif key == "negative_prompt":
                        negative_prompt = value.strip()
    
    except Exception as e:
        print(f"Error reading PNG metadata for {file_path}: {e}")

    return {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "parameters": parameters_raw
    }

@app.post("/api/images/sync")
async def sync_images_to_db():
    print("--- Starting database sync ---")
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute("SELECT image_path FROM images")
        existing_paths = {row[0] for row in await cursor.fetchall()}
        
        image_files = glob.glob(os.path.join(IMAGE_DIR, "**", "*.png"), recursive=True)
        new_files = [f for f in image_files if os.path.relpath(f, IMAGE_DIR) not in existing_paths]
        print(f"Found {len(new_files)} new images to process.")
        
        synced_count = 0
        
        for file_path in new_files:
            relative_path = os.path.relpath(file_path, IMAGE_DIR)
            filename = os.path.basename(file_path)
            
            metadata = extract_metadata(file_path)
            
            try:
                await db.execute(
                    """
                    INSERT INTO images (
                        filename, image_path, created_at, prompt, negative_prompt, parameters, rating
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (filename, relative_path, datetime.datetime.now(), 
                     metadata["prompt"], metadata["negative_prompt"], metadata["parameters"], 0)
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
                ORDER BY created_at DESC
                """,
                (search_query, search_query)
            )
        else:
            cursor = await db.execute("SELECT id, filename, image_path, rating FROM images ORDER BY created_at DESC")
        
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

@app.get("/api/images/{image_id}")
async def get_image_detail(image_id: int):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """
            SELECT
                id, filename, image_path, rating, created_at, prompt, negative_prompt, parameters
            FROM
                images
            WHERE
                id = ?
            """,
            (image_id,)
        )
        row = await cursor.fetchone()
        
        if row:
            image_detail = {
                "id": row[0],
                "filename": row[1],
                "image_path": row[2],
                "rating": row[3],
                "created_at": row[4],
                "prompt": row[5],
                "negative_prompt": row[6],
                "parameters": row[7],
            }
            return image_detail
        else:
            raise HTTPException(status_code=404, detail="Image not found")

@app.put("/api/images/{image_id}/rate")
async def update_image_rating(image_id: int, rating_update: RatingUpdate):
    if rating_update.rating < 0 or rating_update.rating > 5:
        raise HTTPException(status_code=400, detail="Invalid rating value. Must be an integer between 0 and 5.")

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