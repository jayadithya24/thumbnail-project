from flask import Flask, request, jsonify, render_template
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime
import re
import os
from dotenv import load_dotenv
load_dotenv()

# -------------------------
# Flask Setup
# -------------------------
app = Flask(__name__)
CORS(app)

app.config["JWT_SECRET_KEY"] = "super-secret-key-change-this"

bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# -------------------------
# MongoDB Setup
# -------------------------
MONGO_URI = os.environ.get("MONGO_URI")
client = MongoClient(MONGO_URI)

db = client["thumbnail_db"]

users = db["users"]
boards = db["boards"]
thumbnails = db["thumbnails"]

# -------------------------
# Serve Frontend
# -------------------------
@app.route("/")
def home():
    return render_template("index.html")

# -------------------------
# Helper: Extract YouTube ID
# -------------------------
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

# -------------------------
# AUTH ROUTES
# -------------------------

@app.route("/register", methods=["POST"])
def register():
    data = request.json

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    if users.find_one({"email": email}):
        return jsonify({"error": "Email already exists"}), 400

    hashed_pw = bcrypt.generate_password_hash(password).decode("utf-8")

    users.insert_one({
        "email": email,
        "password": hashed_pw,
        "created_at": datetime.utcnow()
    })

    return jsonify({"message": "User registered successfully"}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.json

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = users.find_one({"email": email})

    if not user or not bcrypt.check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=str(user["_id"]))

    return jsonify({"token": token})


# -------------------------
# BOARD ROUTES (Protected)
# -------------------------

@app.route("/boards", methods=["GET"])
@jwt_required()
def get_boards():
    user_id = get_jwt_identity()

    user_boards = list(boards.find({"user_id": user_id}))

    result = []
    for b in user_boards:
        result.append({
            "id": str(b["_id"]),
            "name": b["name"],
            "thumbnail_count": thumbnails.count_documents(
                {"board_id": str(b["_id"])}
            )
        })

    return jsonify(result)


@app.route("/boards", methods=["POST"])
@jwt_required()
def create_board():
    user_id = get_jwt_identity()
    data = request.json

    name = data.get("name")
    if not name:
        return jsonify({"error": "Board name required"}), 400

    result = boards.insert_one({
        "name": name,
        "user_id": user_id,
        "created_at": datetime.utcnow()
    })

    return jsonify({"id": str(result.inserted_id)}), 201


@app.route("/boards/<board_id>", methods=["DELETE"])
@jwt_required()
def delete_board(board_id):
    user_id = get_jwt_identity()

    boards.delete_one({
        "_id": ObjectId(board_id),
        "user_id": user_id
    })

    thumbnails.delete_many({"board_id": board_id})

    return jsonify({"message": "Board deleted"})


# -------------------------
# THUMBNAIL ROUTES
# -------------------------

@app.route("/boards/<board_id>/thumbnails", methods=["GET"])
@jwt_required()
def get_thumbnails(board_id):
    board_thumbs = list(thumbnails.find({"board_id": board_id}))

    result = []
    for t in board_thumbs:
        result.append({
            "id": str(t["_id"]),
            "video_url": t["video_url"],
            "thumbnail_url": t["thumbnail_url"],
            "title": t.get("title", "Untitled"),
            "category": t.get("category", "general"),
            "favorite": t.get("favorite", False),
            "created_at": t.get("created_at")
        })

    return jsonify(result)


@app.route("/boards/<board_id>/thumbnails", methods=["POST"])
@jwt_required()
def add_thumbnail(board_id):
    data = request.json

    video_url = data.get("video_url")
    if not video_url:
        return jsonify({"error": "Video URL required"}), 400

    thumb_url = yt_thumbnail(video_url)
    if not thumb_url:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    result = thumbnails.insert_one({
        "board_id": board_id,
        "video_url": video_url,
        "thumbnail_url": thumb_url,
        "title": data.get("title", "Untitled"),
        "category": data.get("category", "general"),
        "favorite": False,
        "created_at": datetime.utcnow()
    })

    return jsonify({"id": str(result.inserted_id)}), 201


@app.route("/thumbnails/<thumb_id>", methods=["DELETE"])
@jwt_required()
def delete_thumbnail(thumb_id):
    thumbnails.delete_one({"_id": ObjectId(thumb_id)})
    return jsonify({"message": "Thumbnail deleted"})


@app.route("/thumbnails/<thumb_id>/favorite", methods=["PATCH"])
@jwt_required()
def toggle_favorite(thumb_id):
    thumb = thumbnails.find_one({"_id": ObjectId(thumb_id)})

    if not thumb:
        return jsonify({"error": "Thumbnail not found"}), 404

    new_status = not thumb.get("favorite", False)

    thumbnails.update_one(
        {"_id": ObjectId(thumb_id)},
        {"$set": {"favorite": new_status}}
    )

    return jsonify({"favorite": new_status})


# -------------------------
# RUN
# -------------------------
if __name__ == "__main__":
    app.run(debug=True)