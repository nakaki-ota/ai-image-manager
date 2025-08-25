import datetime
from sqlalchemy import MetaData, Table, Column, Integer, String, DateTime, Text, Float

metadata = MetaData()

images_table = Table(
    "images",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("filename", String),
    Column("image_path", String, unique=True),
    Column("rating", Float, default=0.0),
    Column("created_at", DateTime, default=datetime.datetime.now),
    Column("prompt", Text),
    Column("negative_prompt", Text),
    Column("parameters", Text)
)