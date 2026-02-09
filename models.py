from database import db
from datetime import datetime

class Board(db.Model):
    __tablename__ = "boards"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    thumbnails = db.relationship("Thumbnail", backref="board", cascade="all, delete", lazy=True)

class Thumbnail(db.Model):
    __tablename__ = "thumbnails"
    id = db.Column(db.Integer, primary_key=True)
    board_id = db.Column(db.Integer, db.ForeignKey("boards.id"), nullable=False)
    video_url = db.Column(db.String(500), nullable=False)
    thumbnail_url = db.Column(db.String(500), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), default="general")
    favorite = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
