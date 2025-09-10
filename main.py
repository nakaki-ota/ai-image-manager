import os
import glob
import datetime
import aiosqlite
import re
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import asyncio
import png

# データベースファイルのパス
DATABASE_PATH = "db/image_metadata.db"
# 画像ディレクトリのパス (Docker Composeでマウントされる)
IMAGE_DIR = "images"

# 評価更新用のPydanticモデル
class RatingUpdate(BaseModel):
    rating: int

# FastAPIアプリケーションのインスタンスを作成
app = FastAPI()

# CORS設定 (フロントエンドからのアクセスを許可)
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

# 静的ファイルとして画像をマウント (コンテナ内の/app/imagesを/imagesとして公開)
app.mount("/images", StaticFiles(directory=IMAGE_DIR), name="images")

# PNGファイルからメタデータを抽出する関数
def extract_metadata(file_path: str):
    prompt = ""
    negative_prompt = ""
    parameters_raw = ""

    try:
        with open(file_path, 'rb') as f:
            reader = png.Reader(file=f)
            
            # PNGチャンクを走査して'tEXt'チャンクからパラメータを抽出
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
                        
                        break # パラメータチャンクが見つかったら終了
    
    except Exception as e:
        print(f"Error reading PNG metadata for {file_path}: {e}")

    return {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "parameters": parameters_raw
    }

# 新しいプロンプト要素モデル
class PromptElement(BaseModel):
    id: int
    group_name: str
    item_name: str
    value: str # 新しいプロンプト値（英単語）
    type: str # 'radio' or 'checkbox'

# --- APIエンドポイント ---

# 新しいエンドポイント：プロンプト生成要素の提供
@app.get("/api/prompt_elements", response_model=List[PromptElement])
async def get_prompt_elements():
    """
    プロンプト生成のための要素（ラジオボタン、チェックボックス）を提供します。
    このデータはハードコードされており、フロントエンドのUI構築に使用されます。
    """
    elements = [
        # スタイルグループ（ラジオボタン）
        {"id": 1, "group_name": "スタイル", "item_name": "フォトリアル", "value": "photorealistic", "type": "radio"},
        {"id": 2, "group_name": "スタイル", "item_name": "アニメ", "value": "anime", "type": "radio"},
        {"id": 3, "group_name": "スタイル", "item_name": "コミック", "value": "comic", "type": "radio"},
        
        # 被写体グループ（ラジオボタン）
        {"id": 4, "group_name": "被写体", "item_name": "女性", "value": "woman", "type": "radio"},
        {"id": 5, "group_name": "被写体", "item_name": "男性", "value": "man", "type": "radio"},
        {"id": 6, "group_name": "被写体", "item_name": "ロボット", "value": "robot", "type": "radio"},
        
        # シーングループ（チェックボックス）
        {"id": 7, "group_name": "シーン", "item_name": "森", "value": "forest", "type": "checkbox"},
        {"id": 8, "group_name": "シーン", "item_name": "夜空", "value": "night_sky", "type": "checkbox"},
        {"id": 9, "group_name": "シーン", "item_name": "サイバーパンク都市", "value": "cyberpunk_city", "type": "checkbox"},
        {"id": 13, "group_name": "シーン", "item_name": "水中", "value": "underwater", "type": "checkbox"},
        {"id": 14, "group_name": "シーン", "item_name": "宇宙", "value": "space", "type": "checkbox"},
        {"id": 15, "group_name": "シーン", "item_name": "街", "value": "city", "type": "checkbox"},

        # ムードグループ（チェックボックス）
        {"id": 10, "group_name": "ムード", "item_name": "明るい", "value": "bright", "type": "checkbox"},
        {"id": 11, "group_name": "ムード", "item_name": "暗い", "value": "dark", "type": "checkbox"},
        {"id": 12, "group_name": "ムード", "item_name": "ファンタジー", "value": "fantasy", "type": "checkbox"},
        {"id": 16, "group_name": "ムード", "item_name": "穏やか", "value": "calm", "type": "checkbox"},
        {"id": 17, "group_name": "ムード", "item_name": "不穏", "value": "ominous", "type": "checkbox"},
    ]
    # Pydanticモデルのリストとして返す
    return [PromptElement(**e) for e in elements]

# 画像同期APIエンドポイント
@app.post("/api/images/sync")
async def sync_images_to_db():
    print("--- Starting database sync ---")
    async with aiosqlite.connect(DATABASE_PATH) as db:
        # 既存の画像パスをDBから取得
        cursor = await db.execute("SELECT image_path FROM images")
        existing_paths = {row[0] for row in await cursor.fetchall()}
        
        # IMAGE_DIR以下のPNGファイルを再帰的に検索
        image_files = glob.glob(os.path.join(IMAGE_DIR, "**", "*.png"), recursive=True)
        
        # 新しいファイルのみをフィルタリング
        new_files = [f for f in image_files if os.path.relpath(f, IMAGE_DIR) not in existing_paths]

        print(f"Found {len(new_files)} new images to process.")
        
        synced_count = 0
        
        for file_path in new_files:
            # IMAGE_DIRを基準とした相対パスを取得
            relative_path = os.path.relpath(file_path, IMAGE_DIR)
            filename = os.path.basename(file_path)
            
            # メタデータを抽出
            metadata = extract_metadata(file_path)
            
            parameters_raw = metadata["parameters"]
            # 検索用に改行を削除したテキストを生成
            search_text_data = parameters_raw.replace('\n', ' ').strip()
            
            # ファイルの最終更新日時を取得
            file_mtime_timestamp = os.path.getmtime(file_path)
            file_datetime = datetime.datetime.fromtimestamp(file_mtime_timestamp)
            
            try:
                # データベースに挿入
                await db.execute(
                    """
                    INSERT INTO images (
                        filename, image_path, created_at, parameters, search_text, rating
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (filename, relative_path, file_datetime, 
                     parameters_raw, search_text_data, 0)
                )
                print(f"Successfully inserted {filename} into database.")
                synced_count += 1
            except Exception as e:
                print(f"Error inserting {filename} into database: {e}")

        await db.commit() # 変更をコミット
    print(f"--- Database sync complete. Synced {synced_count} new images. ---")
    return {"message": f"Synced {synced_count} new images."}

# 画像リストと検索APIエンドポイント
@app.get("/api/images")
async def list_images_and_search(
    query: Optional[str] = None, # 検索クエリ
    page: int = Query(1, ge=1), # ページ番号 (1以上)
    limit: int = Query(20, ge=1), # 1ページあたりの表示件数 (1以上)
    sort_by: Optional[str] = Query("created_at", pattern="^(created_at|rating)$"), # ソート基準 (デフォルトはcreated_at)
    sort_order: Optional[str] = Query("desc", pattern="^(asc|desc)$") # ソート順序 (デフォルトは降順)
):
    offset = (page - 1) * limit # オフセットを計算
    async with aiosqlite.connect(DATABASE_PATH) as db:
        
        # 検索条件のWHERE句とパラメータを構築
        if query:
            where_clause = "WHERE LOWER(search_text) LIKE ?"
            params = (f"%{query.lower()}%",)
        else:
            where_clause = ""
            params = ()

        # 検索結果の総件数を取得
        cursor = await db.execute(f"SELECT COUNT(*) FROM images {where_clause}", params)
        total_search_results_count = (await cursor.fetchone())[0]

        # データベース全体の総件数を取得
        cursor = await db.execute("SELECT COUNT(*) FROM images")
        total_database_count = (await cursor.fetchone())[0]

        # ソート条件のORDER BY句を構築
        order_by_clause = f"ORDER BY {sort_by} {sort_order}"

        # 画像リストを取得
        cursor = await db.execute(
            f"""
            SELECT
                id, filename, image_path, rating
            FROM
                images
            {where_clause}
            {order_by_clause}
            LIMIT ? OFFSET ?
            """,
            params + (limit, offset) # クエリパラメータとLIMIT/OFFSETを結合
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

# 単一画像詳細取得APIエンドポイント
@app.get("/api/images/{image_id}")
async def get_image_detail(image_id: int):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        # 指定されたIDの画像詳細を取得
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
        
        if row: # 画像が見つかった場合
            image_detail = {
                "id": row[0],
                "filename": row[1],
                "image_path": row[2],
                "rating": row[3],
                "created_at": row[4],
                "parameters": row[5],
            }
            return image_detail
        else: # 画像が見つからない場合
            raise HTTPException(status_code=404, detail="Image not found")

# 画像評価更新APIエンドポイント
@app.put("/api/images/{image_id}/rate")
async def update_image_rating(image_id: int, rating_update: RatingUpdate):
    # 評価値のバリデーション
    if rating_update.rating < 0 or rating_update.rating > 5:
        raise HTTPException(status_code=400, detail="Invalid rating value. Must be an integer between 0 and 5.")

    try:
        async with aiosqlite.connect(DATABASE_PATH) as db:
            # データベースの評価を更新
            await db.execute(
                "UPDATE images SET rating = ? WHERE id = ?",
                (rating_update.rating, image_id)
            )
            await db.commit() # 変更をコミット
        return {"message": f"Image {image_id} rating updated successfully."}
    except Exception as e:
        print(f"An error occurred while updating rating for image_id={image_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rating.")

# 画像削除APIエンドポイント
@app.delete("/api/images/{image_id}")
async def delete_image(image_id: int):
    async with aiosqlite.connect(DATABASE_PATH) as db:
        # 1. データベースから画像のパスを取得
        cursor = await db.execute("SELECT image_path FROM images WHERE id = ?", (image_id,))
        row = await cursor.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Image not found in database.")

        image_relative_path = row[0]
        # IMAGE_DIRと相対パスを結合してフルパスを構築
        image_full_path = os.path.join(IMAGE_DIR, image_relative_path)

        try:
            # 2. ディスクから画像ファイルを削除
            if os.path.exists(image_full_path):
                os.remove(image_full_path)
                print(f"Successfully deleted file: {image_full_path}")
            else:
                # ファイルが見つからないがDBエントリは削除する場合
                print(f"Warning: File not found on disk, but entry exists in DB: {image_full_path}")
            
            # 3. データベースからエントリを削除
            await db.execute("DELETE FROM images WHERE id = ?", (image_id,))
            await db.commit() # 変更をコミット
            
            return {"message": f"Image {image_id} and its file have been successfully deleted."}
        except OSError as e: # ファイル操作に関するエラー
            print(f"Error deleting file {image_full_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")
        except Exception as e: # その他のデータベースエラー
            print(f"Error deleting image {image_id} from database: {e}")
            raise HTTPException(status_code=500, detail="Failed to delete image entry from database.")
