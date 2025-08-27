import datetime
from sqlalchemy import MetaData, Table, Column, Integer, String, DateTime, Text

metadata = MetaData()

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