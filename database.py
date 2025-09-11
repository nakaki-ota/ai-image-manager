import datetime
import os
from sqlalchemy import create_engine, MetaData, Table, Column, Integer, String, DateTime, Text, insert
from sqlalchemy.orm import sessionmaker

metadata = MetaData()

# `images`テーブルのスキーマを定義
images_table = Table(
    "images",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("filename", String),
    Column("image_path", String, unique=True),
    Column("rating", Integer, default=0),
    Column("created_at", DateTime, default=datetime.datetime.now),
    Column("parameters", Text),
    Column("search_text", Text),
)

# `prompt_elements`テーブルのスキーマを定義
prompt_elements_table = Table(
    "prompt_elements",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("group_name", String, nullable=False),
    Column("item_name", String, nullable=False),
    Column("value", String, nullable=False),
    Column("type", String, nullable=False)
)
