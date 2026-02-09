from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from config import Config
from database import db
from models import Board, Thumbnail
import re


# ---------------------------
# Helper Functions
# ---------------------------
def extract_youtube_id(url):
    patterns = [
        r"v=([^&]+)",
        r"youtu\.be/([^?]+)",
        r"youtube\.com/embed/([^?]+)"
    ]

    for p in patterns:
        match = re.search(p, url)
        if match:
            return match.group(1)

    return None


def yt_thumbnail(video_url):
    vid = extract_youtube_id(video_url)
    if not vid:
        return None
    return f"https://img.youtube.com/vi/{vid}/maxresdefault.jpg"


# ---------------------------
# Flask App Setup
# ---------------------------
app = Flask(__name__)
app.config.from_object(Config)

CORS(app)
db.init_app(app)

@app.route("/")
def home():
    return render_template("index.html")

# ---------------------------
# Board Routes
# ---------------------------
@app.route("/boards", methods=["GET"])
def get_boards():
    boards = Board.query.all()
    return jsonify([
        {
            "id": b.id,
            "name": b.name,
            "thumbnail_count": len(b.thumbnails)
        }
        for b in boards
    ])


@app.route("/boards", methods=["POST"])
def create_board():
    data = request.json
    name = data.get("name")

    if not name:
        return jsonify({"error": "Board name required"}), 400

    board = Board(name=name)
    db.session.add(board)
    db.session.commit()

    return jsonify({"status": "created", "id": board.id})


@app.route("/boards/<int:board_id>", methods=["DELETE"])
def delete_board(board_id):
    board = Board.query.get(board_id)
    if not board:
        return jsonify({"error": "Board not found"}), 404

    db.session.delete(board)
    db.session.commit()

    return jsonify({"status": "deleted"})


# ---------------------------
# Thumbnail Routes
# ---------------------------
@app.route("/boards/<int:board_id>/thumbnails", methods=["GET"])
def get_thumbnails(board_id):
    thumbs = Thumbnail.query.filter_by(board_id=board_id).all()

    return jsonify([
        {
            "id": t.id,
            "video_url": t.video_url,
            "thumbnail_url": t.thumbnail_url,
            "title": t.title,
            "category": t.category,
            "favorite": t.favorite,
            "created_at": t.created_at.isoformat()
        }
        for t in thumbs
    ])


@app.route("/boards/<int:board_id>/thumbnails", methods=["POST"])
def add_thumbnail(board_id):
    data = request.json

    video_url = data.get("video_url")
    title = data.get("title", "Untitled")
    category = data.get("category", "general")

    if not video_url:
        return jsonify({"error": "video_url is required"}), 400

    thumbnail_url = yt_thumbnail(video_url)
    if not thumbnail_url:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    new_thumb = Thumbnail(
        board_id=board_id,
        video_url=video_url,
        thumbnail_url=thumbnail_url,
        title=title,
        category=category
    )

    db.session.add(new_thumb)
    db.session.commit()

    return jsonify({"status": "created", "id": new_thumb.id})


@app.route("/thumbnails/<int:thumb_id>", methods=["DELETE"])
def delete_thumbnail(thumb_id):
    thumb = Thumbnail.query.get(thumb_id)
    if not thumb:
        return jsonify({"error": "Thumbnail not found"}), 404

    db.session.delete(thumb)
    db.session.commit()

    return jsonify({"status": "deleted"})


@app.route("/thumbnails/<int:thumb_id>/favorite", methods=["PATCH"])
def toggle_favorite(thumb_id):
    thumb = Thumbnail.query.get(thumb_id)
    if not thumb:
        return jsonify({"error": "Thumbnail not found"}), 404

    thumb.favorite = not thumb.favorite
    db.session.commit()

    return jsonify({"favorite": thumb.favorite})


# ---------------------------
# Initialize DB for Flask 3.x
# ---------------------------
with app.app_context():
    db.create_all()


# ---------------------------
# Run App
# ---------------------------
if __name__ == "__main__":
    app.run(debug=True)
