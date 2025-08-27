import os
import glob
import datetime
import aiosqlite
import re
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import asyncio
import png

# database.pyから必要な定義をインポート
# Alembicを使用するため、ここではデータベース接続パスのみを定義
DATABASE_PATH = "db/image_metadata.db"
IMAGE_DIR = "images"

class RatingUpdate(BaseModel):
    rating: int

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

app.mount("/images", StaticFiles(directory=IMAGE_DIR), name="images")

def extract_metadata(file_path: str):
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
                            prompt = lines[0].strip()
                        
                        for line in lines[1:]:
                            if line.startswith("Negative prompt:"):
                                negative_prompt = line.replace("Negative prompt:", "").strip()
                        
                        break
    
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
            
            parameters_raw = metadata["parameters"]
            search_text_data = parameters_raw.replace('\n', ' ').strip()
            
            try:
                await db.execute(
                    """
                    INSERT INTO images (
                        filename, image_path, created_at, parameters, search_text, rating
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (filename, relative_path, datetime.datetime.now(), 
                     parameters_raw, search_text_data, 0)
                )
                print(f"Successfully inserted {filename} into database.")
                synced_count += 1
            except Exception as e:
                print(f"Error inserting {filename} into database: {e}")

        await db.commit()
    print(f"--- Database sync complete. Synced {synced_count} new images. ---")
    return {"message": f"Synced {synced_count} new images."}

@app.get("/api/images")
async def list_images_and_search(
    query: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1)
):
    offset = (page - 1) * limit
    async with aiosqlite.connect(DATABASE_PATH) as db:
        
        if query:
            where_clause = "WHERE LOWER(search_text) LIKE ?"
            params = (f"%{query.lower()}%",)
        else:
            where_clause = ""
            params = ()

        # 検索結果の件数を取得 (既存のロジック)
        cursor = await db.execute(f"SELECT COUNT(*) FROM images {where_clause}", params)
        total_search_results_count = (await cursor.fetchone())[0]

        # データベース全体の件数を取得 (新規追加)
        cursor = await db.execute("SELECT COUNT(*) FROM images")
        total_database_count = (await cursor.fetchone())[0]

        # 画像リストを取得
        cursor = await db.execute(
            f"""
            SELECT
                id, filename, image_path, rating
            FROM
                images
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            params + (limit, offset)
        )
        rows = await cursor.fetchall()
        
        images = []
        for row in rows:
            images.append({
                "id": row[0],
                "filename": row[1],
                "image_path": row[2],
                "rating": row[3],
            })
        
        return {
            "images": images,
            "total_search_results_count": total_search_results_count,
            "total_database_count": total_database_count
        }

@app.get("/api/images/{image_id}")
async def get_image_detail(image_id: int):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        cursor = await db.execute(
            """
            SELECT
                id, filename, image_path, rating, created_at, parameters
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
                "parameters": row[5],
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